import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import socket from '../socket';
import Card from './Card';
import PlayerCardGrid from './PlayerCardGrid';
import StatsPanel from './StatsPanel';
import RulesModal from './RulesModal';
import PlayerToasts from './PlayerToasts';
import ChatPanel from './ChatPanel';
import SwapAnimOverlay from './SwapAnimOverlay';
import GiveCardAnim from './GiveCardAnim';
import GameLog from './GameLog';
import DealAnimation from './DealAnimation';

// ── Game event log detection ───────────────────────────────────────────────────
function detectGameEvents(prev, cur, myId) {
  const entries = [];
  if (!cur) return entries;

  const players = cur.players ?? [];
  const pName = (id) => players.find(p => p.id === id)?.name ?? '?';
  const you   = (id) => id === myId ? 'You' : pName(id);
  const pos   = (p)  => p?.startsWith('extra') ? 'extra card' : p ?? '?';

  // Round start — signals the caller to clear logs first
  if (cur.roundNumber > 0 && cur.roundNumber !== (prev?.roundNumber ?? 0)) {
    return [{ text: `Round ${cur.roundNumber} started`, type: 'round', clearBefore: true }];
  }

  // Phase transitions
  if (cur.phase === 'peek' && prev?.phase === 'lobby') {
    entries.push({ text: 'Game started — memorise your bottom two cards!', type: 'info' });
  }
  if (cur.phase === 'playing' && prev?.phase === 'peek') {
    entries.push({ text: 'Cards hidden — play begins', type: 'info' });
  }

  // Turn change
  if (cur.phase === 'playing' &&
      cur.currentTurnPlayerId &&
      cur.currentTurnPlayerId !== prev?.currentTurnPlayerId) {
    const label = cur.currentTurnPlayerId === myId ? 'Your turn' : `${pName(cur.currentTurnPlayerId)}'s turn`;
    entries.push({ text: label, type: 'turn' });
  }

  // Kaaboo called
  if (cur.kaabooCallerId && !prev?.kaabooCallerId) {
    entries.push({ text: `${you(cur.kaabooCallerId)} called KAABOO!`, type: 'kaaboo' });
  }

  // Player played their drawn card (handSize 1→0 + discard pile grew, not a playdown claim)
  if ((cur.discardPile?.length ?? 0) > (prev?.discardPile?.length ?? 0) &&
      !cur.playdownWindow?.claimed) {
    const topCard = cur.discardPile?.at(-1);
    for (const p of players) {
      const prevP = prev?.players?.find(pp => pp.id === p.id);
      if (prevP && prevP.handSize === 1 && p.handSize === 0) {
        entries.push({ text: `${you(p.id)} played a ${topCard?.rank ?? '?'}`, type: 'action' });
        break;
      }
    }
  }

  // Playdown window opened
  if (cur.playdownWindow && !prev?.playdownWindow) {
    entries.push({ text: `Playdown window: ${cur.playdownWindow.topCardRank}s in play!`, type: 'playdown' });
  }

  // Playdown claimed
  if (cur.playdownWindow?.claimed && !prev?.playdownWindow?.claimed) {
    entries.push({ text: `Playdown! ${cur.playdownWindow.topCardRank} matched`, type: 'playdown-win' });
  }

  // Give-card window
  if (cur.giveCardWindow && !prev?.giveCardWindow) {
    entries.push({
      text: `${you(cur.giveCardWindow.giverId)} must give a card to ${you(cur.giveCardWindow.receiverId)}`,
      type: 'give',
    });
  }

  // Power opportunity (decision phase)
  if (cur.powerWindow?.phase === 'decision' && prev?.powerWindow?.phase !== 'decision') {
    entries.push({
      text: `${you(cur.powerWindow.playerId)} drew a ${cur.powerWindow.cardRank} — ${cur.powerWindow.powerLabel}`,
      type: 'power',
    });
  }

  // Power used
  if (cur.powerWindow?.phase === 'action' && prev?.powerWindow?.phase === 'decision') {
    entries.push({
      text: `${you(cur.powerWindow.playerId)} used their ${cur.powerWindow.cardRank} power`,
      type: 'power-used',
    });
  }

  // Power skipped (decision window closed without using)
  if (!cur.powerWindow && prev?.powerWindow?.phase === 'decision') {
    entries.push({
      text: `${you(prev.powerWindow.playerId)} skipped their ${prev.powerWindow.cardRank} power`,
      type: 'power-skip',
    });
  }

  // Peek completed
  const prevPeeked = prev?.powerWindow?.peekedCards?.length ?? 0;
  const curPeeked  = cur.powerWindow?.peekedCards?.length ?? 0;
  if (curPeeked > prevPeeked && cur.powerWindow) {
    const newest  = cur.powerWindow.peekedCards[curPeeked - 1];
    const peeker  = you(cur.powerWindow.playerId);
    const target  = newest.ownerId === cur.powerWindow.playerId ? 'their own' : `${you(newest.ownerId)}'s`;
    entries.push({ text: `${peeker} peeked at ${target} card`, type: 'peek' });
  }

  // Penalty card received (grid grew while playdown window open and not claimed)
  if (cur.playdownWindow && !cur.playdownWindow.claimed) {
    for (const curP of cur.players) {
      const prevP    = prev?.players?.find(pp => pp.id === curP.id);
      const prevPosSet = new Set(prevP?.grid?.map(s => s.position) ?? []);
      const newSlot  = curP.grid.find(s => s.hasCard && !prevPosSet.has(s.position));
      if (newSlot) {
        entries.push({ text: `${you(curP.id)} got a penalty card!`, type: 'penalty' });
      }
    }
  }

  // Give-card completed
  if (prev?.giveCardWindow && !cur.giveCardWindow && cur.phase !== 'finished') {
    const giverId    = prev.giveCardWindow.giverId;
    const receiverId = prev.giveCardWindow.receiverId;
    entries.push({ text: `${you(giverId)} gave a card to ${you(receiverId)}`, type: 'give' });
  }

  // Swap completed
  if (!prev?.lastSwap && cur.lastSwap) {
    const swap   = cur.lastSwap;
    const aOwner = swap.first.playerId  === myId ? 'your' : `${pName(swap.first.playerId)}'s`;
    const bOwner = swap.second.playerId === myId ? 'your' : `${pName(swap.second.playerId)}'s`;
    entries.push({
      text: `${swap.swapperName} swapped ${aOwner} ${pos(swap.first.position)} with ${bOwner} ${pos(swap.second.position)}`,
      type: 'swap',
    });
  }

  // Game finished
  if (cur.phase === 'finished' && prev?.phase !== 'finished' && cur.finalResult) {
    const caller  = you(cur.finalResult.kaabooCallerId);
    const outcome = cur.finalResult.kaabooCallerWon ? 'WON' : 'LOST';
    entries.push({ text: `${caller} called Kaaboo and ${outcome}!`, type: cur.finalResult.kaabooCallerWon ? 'win' : 'loss' });
  }

  return entries;
}

function useCountdown(endsAt) {
  const [secs, setSecs] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    if (!endsAt) { setSecs(0); clearInterval(ref.current); return; }
    const tick = () => setSecs(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    ref.current = setInterval(tick, 100);
    return () => clearInterval(ref.current);
  }, [endsAt]);
  return secs;
}

const POWER_RANK_SYMBOL = { '7':'7','8':'8','9':'9','10':'10','J':'J','Q':'Q' };

// Small inline scoreboard indicator shown next to each player during the game.
function ScoreBoardPip({ value }) {
  const cls = value > 0 ? 'pos' : value < 0 ? 'neg' : 'neutral';
  const label = value > 0 ? `+${value}` : String(value);
  return (
    <span className={`sb-pip sb-pip-${cls}`} title="Scoreboard">SB {label}</span>
  );
}

export default function GameBoard({ gameState, myId, onError, onLeave, currentUser, onLogout }) {
  const peekSecs     = useCountdown(gameState?.peekEndsAt);
  const playdownSecs = useCountdown(gameState?.playdownWindow?.endsAt);
  const giveCardSecs = useCountdown(gameState?.giveCardWindow?.endsAt);
  const powerSecs    = useCountdown(gameState?.powerWindow?.endsAt);

  const [activePowerMode, setActivePowerMode] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);

  // Peek reveal overlay
  const [peekReveal, setPeekReveal] = useState(null); // { card, ownerName }
  const [peekRevealExpiresAt, setPeekRevealExpiresAt] = useState(null);
  const peekRevealSecs = useCountdown(peekRevealExpiresAt);

  // Deal animation — shown once on lobby→peek transition
  const [showDeal, setShowDeal] = useState(false);
  const prevPhaseRef = useRef(null);
  useEffect(() => {
    if (prevPhaseRef.current === null && gameState?.phase === 'dealing') setShowDeal(true);
    prevPhaseRef.current = gameState?.phase ?? null;
  }, [gameState?.phase]);

  // Swap animation + game log — share one "previous state" ref
  const prevStateRef = useRef(null);
  const [swapAnim, setSwapAnim] = useState(null);
  const [giveAnim, setGiveAnim] = useState(null);         // { from:{rect,card}, to:{rect} }
  const [replaceAnim, setReplaceAnim] = useState(null);   // { from:{rect,card}, to:{rect} }
  const [penaltySlots, setPenaltySlots] = useState([]);   // [{ playerId, position }]
  const [logs, setLogs] = useState([]);
  const logIdRef = useRef(0);

  useEffect(() => {
    if (!gameState?.powerWindow || gameState.powerWindow.phase !== 'action') {
      setActivePowerMode(null);
    }
  }, [gameState?.powerWindow?.phase]);

  const prevSwapSel = useRef(null);
  useEffect(() => {
    if (prevSwapSel.current && !gameState?.powerWindow?.swapSelection) setActivePowerMode(null);
    prevSwapSel.current = gameState?.powerWindow?.swapSelection ?? null;
  }, [gameState?.powerWindow?.swapSelection]);

  // Combined: swap animation + game log (both need prev vs cur comparison)
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = gameState;
    if (!gameState) return;

    // ── Swap animation ──────────────────────────────────────────────────────
    if (!prev?.lastSwap && gameState.lastSwap) {
      const swap = gameState.lastSwap;
      const el1 = document.querySelector(`[data-player="${swap.first.playerId}"][data-slot="${swap.first.position}"]`);
      const el2 = document.querySelector(`[data-player="${swap.second.playerId}"][data-slot="${swap.second.position}"]`);
      if (el1 && el2) {
        const rect1 = el1.getBoundingClientRect();
        const rect2 = el2.getBoundingClientRect();
        // Cards at the positions BEFORE the swap (from prev state)
        const prevCard1 = prev?.players?.find(p => p.id === swap.first.playerId)
          ?.grid?.find(s => s.position === swap.first.position)?.card ?? null;
        const prevCard2 = prev?.players?.find(p => p.id === swap.second.playerId)
          ?.grid?.find(s => s.position === swap.second.position)?.card ?? null;
        setSwapAnim({ first: { rect: rect1, card: prevCard1 }, second: { rect: rect2, card: prevCard2 } });
        setTimeout(() => setSwapAnim(null), 1100);
      }
    }

    // ── Give-card animation ─────────────────────────────────────────────────
    if (prev?.giveCardWindow && !gameState.giveCardWindow && gameState.phase !== 'finished') {
      const { giverId, receiverId } = prev.giveCardWindow;

      // Find which slot in giver's grid became empty
      const prevGiver = prev.players?.find(p => p.id === giverId);
      const curGiver  = gameState.players?.find(p => p.id === giverId);
      let givenPos = null, givenCard = null;
      for (const ps of (prevGiver?.grid ?? [])) {
        if (ps.hasCard) {
          const cs = curGiver?.grid?.find(s => s.position === ps.position);
          if (cs && !cs.hasCard) { givenPos = ps.position; givenCard = ps.card ?? null; break; }
        }
      }

      // Find the new extra-N slot in receiver's grid
      const prevRecvPos = new Set(prev.players?.find(p => p.id === receiverId)?.grid?.map(s => s.position) ?? []);
      const newRecvSlot = gameState.players?.find(p => p.id === receiverId)?.grid?.find(s => !prevRecvPos.has(s.position));

      if (givenPos && newRecvSlot) {
        const srcEl = document.querySelector(`[data-player="${giverId}"][data-slot="${givenPos}"]`);
        const dstEl = document.querySelector(`[data-player="${receiverId}"][data-slot="${newRecvSlot.position}"]`);
        if (srcEl && dstEl) {
          setGiveAnim({ from: { rect: srcEl.getBoundingClientRect(), card: givenCard }, to: { rect: dstEl.getBoundingClientRect() } });
          setTimeout(() => setGiveAnim(null), 1100);
        }
      }
    }

    // ── Replace animation (drawn card → grid slot) ──────────────────────────
    const prevHand = prev?.myHand ?? [];
    const currHand = gameState.myHand ?? [];
    if (prevHand.length > 0 && currHand.length === 0) {
      const drawnCard = prevHand[0];
      const myPrevGrid = prev.players?.find(p => p.id === myId)?.grid ?? [];
      const myCurrGrid = gameState.players?.find(p => p.id === myId)?.grid ?? [];
      const changedSlot = myCurrGrid.find(s => {
        const old = myPrevGrid.find(ps => ps.position === s.position);
        return s.card && old?.card?.rank !== s.card?.rank;
      });
      if (changedSlot) {
        const fromEl = document.querySelector('.drawn-card-area');
        const toEl   = document.querySelector(`[data-player="${myId}"][data-slot="${changedSlot.position}"]`);
        if (fromEl && toEl) {
          setReplaceAnim({ from: { rect: fromEl.getBoundingClientRect(), card: drawnCard }, to: { rect: toEl.getBoundingClientRect() } });
          setTimeout(() => setReplaceAnim(null), 550);
        }
      }
    }

    // ── Playdown animation (grid slot → discard pile) ────────────────────────
    const wasOpen    = prev?.playdownWindow && !prev.playdownWindow.claimed;
    const nowClaimed = gameState.playdownWindow?.claimed || (!gameState.playdownWindow && wasOpen);
    if (wasOpen && nowClaimed) {
      for (const currP of gameState.players) {
        const prevP = prev.players?.find(p => p.id === currP.id);
        const lostSlot = prevP?.grid?.find(ps =>
          ps.card && !currP.grid.find(s => s.position === ps.position)?.card
        );
        if (lostSlot) {
          const fromEl = document.querySelector(`[data-player="${currP.id}"][data-slot="${lostSlot.position}"]`);
          const toEl   = document.querySelector('.discard-pile');
          if (fromEl && toEl) {
            setReplaceAnim({ from: { rect: fromEl.getBoundingClientRect(), card: lostSlot.card }, to: { rect: toEl.getBoundingClientRect() } });
            setTimeout(() => setReplaceAnim(null), 550);
          }
          break;
        }
      }
    }

    // ── Penalty card highlight ───────────────────────────────────────────────
    if (gameState.playdownWindow && !gameState.playdownWindow.claimed) {
      for (const curP of gameState.players) {
        const prevP    = prev?.players?.find(pp => pp.id === curP.id);
        const prevPos  = new Set(prevP?.grid?.map(s => s.position) ?? []);
        const newSlot  = curP.grid.find(s => s.hasCard && !prevPos.has(s.position));
        if (newSlot) {
          const entry = { playerId: curP.id, position: newSlot.position };
          setPenaltySlots(ps => [...ps, entry]);
          setTimeout(() => setPenaltySlots(ps => ps.filter(s => !(s.playerId === entry.playerId && s.position === entry.position))), 3000);
        }
      }
    }

    // ── Game log ────────────────────────────────────────────────────────────
    const entries = detectGameEvents(prev, gameState, myId);
    if (entries.length > 0) {
      const shouldClear = entries.some(e => e.clearBefore);
      setLogs(prevLogs => {
        const base = shouldClear ? [] : prevLogs;
        return [...base, ...entries.map(e => ({
          id: ++logIdRef.current,
          ts: Date.now(),
          text: e.text,
          type: e.type,
        }))];
      });
    }
  }, [gameState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-hide peek reveal when countdown reaches zero
  useEffect(() => {
    // Guard: only clear when the timer has truly expired, not when secs hasn't
    // initialised yet (useState(0) starts at 0 before the countdown effect fires).
    if (peekRevealSecs === 0 && peekRevealExpiresAt !== null && Date.now() >= peekRevealExpiresAt) {
      setPeekReveal(null);
      setPeekRevealExpiresAt(null);
    }
  }, [peekRevealSecs, peekRevealExpiresAt]);

  // Detect a newly peeked card via raw socket events — bypasses React 18 batching.
  // For single-use peek powers (7/8/9/10) the server closes the power window immediately
  // after the peek, so two game-state events arrive nearly simultaneously. React batches
  // them into one render, skipping the intermediate state that contains the peeked card.
  // Listening on the socket directly ensures we see every event; flushSync commits the
  // peek reveal before the second (window-closed) event's state update is processed.
  useEffect(() => {
    let lastCount    = 0;
    let lastPlayerId = null;

    const handler = (state) => {
      const pw = state?.powerWindow;
      if (!pw) { lastCount = 0; lastPlayerId = null; return; }
      if (pw.playerId !== lastPlayerId) { lastCount = 0; lastPlayerId = pw.playerId; }

      const peeked = pw.peekedCards ?? [];
      if (pw.playerId === myId && pw.phase === 'action' && peeked.length > lastCount) {
        const newest   = peeked[peeked.length - 1];
        const owner    = state.players?.find((p) => p.id === newest.ownerId);
        const slot     = owner?.grid?.find((s) => s.position === newest.position);
        if (slot?.card) {
          const ownerName = owner.id === myId ? 'your own card' : `${owner.name}'s card`;
          flushSync(() => {
            setPeekReveal({ card: slot.card, ownerName });
            setPeekRevealExpiresAt(Date.now() + 5000);
          });
        }
      }
      lastCount = peeked.length;
    };

    socket.on('game-state', handler);
    return () => socket.off('game-state', handler);
  }, [myId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!gameState) return <div className="loading">Loading game…</div>;

  const {
    players, myHand, phase,
    deckSize, discardPile,
    currentTurnPlayerId, turnOrder,
    playdownWindow, giveCardWindow, powerWindow,
    kaabooCallerId, finalResult, lastSwap,
  } = gameState;

  // Build per-player peek/swap highlight sets from public game state
  const peekedByPlayer = {};
  if (powerWindow?.peekedCards) {
    for (const { ownerId, position } of powerWindow.peekedCards) {
      (peekedByPlayer[ownerId] ??= []).push(position);
    }
  }
  const swappedByPlayer = {};
  if (lastSwap) {
    (swappedByPlayer[lastSwap.first.playerId]  ??= []).push(lastSwap.first.position);
    (swappedByPlayer[lastSwap.second.playerId] ??= []).push(lastSwap.second.position);
  }

  const isMyTurn     = currentTurnPlayerId === myId;
  const isPeek       = phase === 'peek';
  const isFinished   = phase === 'finished';
  const drawnCard    = myHand?.[0] ?? null;
  const hasDrawnCard = Boolean(drawnCard);
  const needsToDraw  = isMyTurn && !hasDrawnCard && !playdownWindow && !giveCardWindow && !powerWindow && !isFinished;

  const kaabooAlreadyCalled = Boolean(kaabooCallerId);
  const amKaabooCallerBadge = kaabooCallerId === myId;

  const isEligiblePlaydown = playdownWindow && !playdownWindow.claimed
                              && playdownWindow.eligiblePlayers?.includes(myId);
  const isGiveCardGiver    = giveCardWindow?.giverId === myId;
  const isGiveCardReceiver = giveCardWindow?.receiverId === myId;
  const isMyPower          = powerWindow?.playerId === myId;
  const powerPhase         = powerWindow?.phase;
  const powerType          = powerWindow?.powerType;

  const me     = players.find((p) => p.id === myId);
  const others = (turnOrder ?? [])
    .filter((id) => id !== myId)
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean);

  const topDiscard = discardPile?.at(-1) ?? null;

  // ── Power action mode ────────────────────────────────────────────────────
  const powerActionMode = (() => {
    if (!isMyPower || powerPhase !== 'action') return null;
    if (powerWindow.swapSelection) return 'swap-second';
    if (powerType === 'peek-self')  return 'peek-self';
    if (powerType === 'peek-other') return 'peek-other';
    if (powerType === 'swap')       return 'swap-first';
    if (powerType === 'double') {
      if (activePowerMode === 'peek') return 'peek-any';
      if (activePowerMode === 'swap') return 'swap-first';
      return null;
    }
    return null;
  })();

  // ── Actions ──────────────────────────────────────────────────────────────
  const drawCard      = () => socket.emit('draw-card', (r) => { if (r?.error) onError(r.error); });
  const discardDrawn  = () => socket.emit('discard-drawn-card', (r) => { if (r?.error) onError(r.error); });
  const replaceGrid   = (pos) => socket.emit('replace-grid-card', { gridPosition: pos }, (r) => { if (r?.error) onError(r.error); });
  const playDown      = (ownerId, pos) => socket.emit('play-down', { cardOwnerId: ownerId, gridPosition: pos }, (r) => { if (r?.error) onError(r.error); });
  const giveCard      = (pos) => socket.emit('give-card', { gridPosition: pos }, (r) => { if (r?.error) onError(r.error); });
  const callKaaboo    = () => socket.emit('call-kaaboo', (r) => { if (r?.error) onError(r.error); });
  const restartGame   = () => socket.emit('start-game', (r) => { if (r?.error) onError(r.error); });
  const usePower      = () => socket.emit('power-decision', { use: true }, (r) => { if (r?.error) onError(r.error); });
  const skipPower     = () => socket.emit('power-decision', { use: false }, (r) => { if (r?.error) onError(r.error); });
  const skipRemaining = () => socket.emit('power-skip', (r) => { if (r?.error) onError(r.error); });

  const powerPeekCard = (tId, pos) =>
    socket.emit('power-peek', { targetPlayerId: tId, gridPosition: pos }, (r) => {
      if (r?.error) return onError(r.error);
      setActivePowerMode(null);
    });

  const powerSwapCard = (tId, pos) =>
    socket.emit('power-swap-select', { targetPlayerId: tId, gridPosition: pos }, (r) => {
      if (r?.error) onError(r.error);
    });

  // ── Grid helpers ──────────────────────────────────────────────────────────
  const myGridSelectable = Boolean(
    (hasDrawnCard && isMyTurn) || isEligiblePlaydown || isGiveCardGiver ||
    ['peek-self','peek-any','swap-first','swap-second'].includes(powerActionMode)
  );
  const oppSelectable = Boolean(
    isEligiblePlaydown ||
    ['peek-other','peek-any','swap-first','swap-second'].includes(powerActionMode)
  );
  const myGridClick = (() => {
    if (isGiveCardGiver) return giveCard;
    if (isEligiblePlaydown) return (p) => playDown(myId, p);
    if (['peek-self','peek-any'].includes(powerActionMode)) return (p) => powerPeekCard(myId, p);
    if (['swap-first','swap-second'].includes(powerActionMode)) return (p) => powerSwapCard(myId, p);
    if (hasDrawnCard && isMyTurn) return replaceGrid;
    return undefined;
  })();
  const oppClick = (oid) => {
    if (isEligiblePlaydown) return (p) => playDown(oid, p);
    if (['peek-other','peek-any'].includes(powerActionMode)) return (p) => powerPeekCard(oid, p);
    if (['swap-first','swap-second'].includes(powerActionMode)) return (p) => powerSwapCard(oid, p);
    return undefined;
  };
  const myGridHint = (() => {
    if (isGiveCardGiver) return 'Choose a card to give away';
    if (isEligiblePlaydown) return 'Play your own card down';
    if (powerActionMode === 'peek-self')   return 'Click a card to peek at it';
    if (powerActionMode === 'peek-any')    return 'Click any of your cards to peek';
    if (powerActionMode === 'swap-first')  return 'Select the first card to swap';
    if (powerActionMode === 'swap-second') return 'Now select the second card';
    if (hasDrawnCard && isMyTurn) return 'Click a card to replace it';
    return null;
  })();

  const swapSel = powerWindow?.swapSelection;
  const myHighlighted  = swapSel?.playerId === myId ? swapSel.gridPosition : null;
  const oppHighlighted = (oid) => swapSel?.playerId === oid ? swapSel.gridPosition : null;

  const playerName = (id) => players.find((p) => p.id === id)?.name ?? '…';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="gameboard">
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      <PlayerToasts players={players} />
      <ChatPanel
        myName={currentUser?.username}
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        onUnread={() => setChatUnread((n) => n + 1)}
      />

      {/* Header */}
      <header className="game-header">
        <span className="title-small">Kaaboo</span>
        <span className="room-code-small">#{gameState.roomId}</span>
        {gameState.roundNumber > 0 && (
          <span className="round-badge">Round {gameState.roundNumber}</span>
        )}
        {isMyTurn && phase === 'playing' && !playdownWindow && !giveCardWindow && !powerWindow && (
          <span className="header-turn-badge your-turn-badge">Your turn</span>
        )}
        {currentUser && (
          <span className="header-username">{currentUser.username}</span>
        )}
        <button
          className="btn-ghost btn-chat"
          onClick={() => { setChatOpen((o) => !o); setChatUnread(0); }}
          title="Chat"
        >
          💬{chatUnread > 0 && <span className="chat-unread-badge">{chatUnread}</span>}
        </button>
        <button className="btn-ghost btn-rules-help" onClick={() => setShowRules(true)} title="Rules & Powers">?</button>
        <button className="btn-ghost btn-leave" onClick={onLeave}>Leave</button>
        {onLogout && (
          <button className="btn-ghost" style={{ marginLeft: '6px' }} onClick={onLogout}>Log Out</button>
        )}
      </header>

      {/* Kaaboo called banner */}
      {kaabooCallerId && !isFinished && (
        <div className="kaaboo-active-banner">
          <span className="kaaboo-star">★</span>
          <span>
            <strong>{playerName(kaabooCallerId)}</strong> called KAABOO!
            {' '}Game ends when their turn comes around.
          </span>
        </div>
      )}

      {/* Peek banner */}
      {isPeek && (
        <div className="peek-banner">
          <span className="peek-icon">👁</span>
          <span>Memorise your <strong>bottom two cards</strong> — hiding in{' '}
            <span className={`peek-countdown${peekSecs <= 3 ? ' peek-countdown-urgent' : ''}`}>{peekSecs}s</span>
          </span>
        </div>
      )}

      {/* Play-down banner */}
      {playdownWindow && !playdownWindow.claimed && (
        <div className={`playdown-banner${isEligiblePlaydown ? ' playdown-eligible' : ''}`}>
          <div className="pd-timer-col">
            <span className="pd-timer-label">Time left</span>
            <span className={`pd-countdown${playdownSecs <= 1 ? ' pd-countdown-urgent' : ''}`}>{playdownSecs}</span>
          </div>
          <div className="pd-body">
            <span className="pd-main-text">
              ⚡ Play a <strong>{playdownWindow.topCardRank}</strong> to play down!
            </span>
            {isEligiblePlaydown
              ? <span className="pd-eligible-hint">Click any matching card — yours or an opponent's</span>
              : <span className="pd-ineligible-badge">✕ Not eligible this turn</span>}
          </div>
        </div>
      )}

      {/* Give-card banner */}
      {giveCardWindow && (
        <div className={`givecard-banner${isGiveCardGiver ? ' givecard-giver' : ''}`}>
          {isGiveCardGiver ? (<>
            <span className="gc-icon">🤲</span>
            <span>Give a card to <strong>{playerName(giveCardWindow.receiverId)}</strong>{' — '}
              <span className={`gc-countdown${giveCardSecs <= 2 ? ' gc-countdown-urgent' : ''}`}>{giveCardSecs}s</span>
            </span>
            <span className="gc-hint">Random card given if time runs out</span>
          </>) : isGiveCardReceiver ? (<>
            <span className="gc-icon">🃏</span>
            <span><strong>{playerName(giveCardWindow.giverId)}</strong> is choosing a card to give you…</span>
          </>) : (<>
            <span className="gc-icon">🤲</span>
            <span><strong>{playerName(giveCardWindow.giverId)}</strong> is giving a card to <strong>{playerName(giveCardWindow.receiverId)}</strong>…</span>
          </>)}
        </div>
      )}

      {/* Power banner — spectator only (someone else's power) */}
      {powerWindow && !isMyPower && (
        <div className="power-banner">
          <div className="power-rank-badge power-rank-dim">{POWER_RANK_SYMBOL[powerWindow.cardRank]}</div>
          {powerPhase === 'decision'
            ? <span><strong>{playerName(powerWindow.playerId)}</strong> may use their <strong>{powerWindow.cardRank}</strong> power… <span className="power-countdown">{powerSecs}s</span></span>
            : <span><strong>{playerName(powerWindow.playerId)}</strong> is using their <strong>{powerWindow.cardRank}</strong> power… <span className="power-countdown">{powerSecs}s</span></span>
          }
        </div>
      )}

      {/* Swap banner */}
      {lastSwap && (
        <div className="swap-banner">
          <span className="swap-banner-icon">🔀</span>
          <span><strong>{lastSwap.swapperName}</strong> swapped two cards!</span>
        </div>
      )}

      {/* Opponents */}
      <div className="opponents-row">
        {others.map((p) => (
          <div key={p.id} className="opponent-container">
            <PlayerCardGrid
              grid={p.grid}
              small
              playerId={p.id}
              isActive={currentTurnPlayerId === p.id}
              label={
                (p.id === kaabooCallerId ? '★ ' : '') +
                p.name +
                (p.isHost ? ' 👑' : '') +
                (currentTurnPlayerId === p.id ? ' ▶' : '')
              }
              selectable={oppSelectable}
              onSlotClick={oppClick(p.id)}
              highlightedSlot={oppHighlighted(p.id)}
              peekedSlots={peekedByPlayer[p.id] ?? []}
              swappedSlots={swappedByPlayer[p.id] ?? []}
              penaltySlots={penaltySlots.filter(s => s.playerId === p.id).map(s => s.position)}
            />
            {p.handSize > 0 && <div className="opponent-deciding">deciding…</div>}
            <ScoreBoardPip value={p.scoreBoard} />
          </div>
        ))}
      </div>

      {/* Table centre */}
      <div className="table-centre">
        <div className="pile-container">
          <div className="pile-label">Deck ({deckSize})</div>
          <div className={`deck-pile${needsToDraw ? ' deck-clickable' : ''}`}
               onClick={needsToDraw ? drawCard : undefined}>
            {deckSize > 0 ? <Card faceDown /> : <div className="empty-pile">Empty</div>}
          </div>
          {needsToDraw && (
            <div className="draw-actions">
              <div className="pile-hint" onClick={drawCard} style={{cursor:'pointer'}}>Click to draw</div>
              {!kaabooAlreadyCalled && (
                <button className="btn-kaaboo" onClick={callKaaboo}>★ Kaaboo!</button>
              )}
            </div>
          )}
        </div>

        {hasDrawnCard && isMyTurn && (
          <div className="drawn-card-area">
            <div className="pile-label">Your draw</div>
            <Card card={drawnCard} />
            <button className="btn-secondary btn-discard" onClick={discardDrawn}>Discard it</button>
          </div>
        )}

        <div className="pile-container">
          <div className="pile-label">Discard</div>
          <div className="discard-pile">
            {topDiscard
              ? <Card key={`${topDiscard.rank}-${topDiscard.suit}`} card={topDiscard} />
              : <div className="empty-pile">Empty</div>}
          </div>
        </div>
      </div>

      {/* My grid */}
      <div className="my-area">
        <div className="my-area-header">
          <span className="my-area-label">
            {amKaabooCallerBadge && <span className="kaaboo-caller-badge">★ KAABOO</span>}
            {me?.name ?? 'You'}{me?.isHost && ' 👑'}
          </span>
          <ScoreBoardPip value={me?.scoreBoard ?? 0} />
          {isPeek && <span className="peek-hint">Bottom cards visible for {peekSecs}s</span>}
          {!isPeek && myGridHint && <span className="action-hint">{myGridHint}</span>}
        </div>

        {/* Power panel — my power, shown near my cards */}
        {powerWindow && isMyPower && (
          <div className={`power-panel${powerPhase === 'decision' ? ' power-panel-decision' : ' power-panel-action'}`}>
            <div className="power-rank-badge">{POWER_RANK_SYMBOL[powerWindow.cardRank]}</div>
            <div className="power-panel-body">
              {powerPhase === 'decision' && (
                <>
                  <span className="power-panel-name">{powerWindow.powerLabel}</span>
                  <span className="power-panel-sub">Use your power?</span>
                </>
              )}
              {powerPhase === 'action' && (
                <>
                  {powerType === 'double' && !powerWindow.swapSelection && !activePowerMode && <span className="power-panel-name">Choose your action</span>}
                  {powerWindow.swapSelection                                                  && <span className="power-panel-name">Select the second card to swap</span>}
                  {powerActionMode === 'peek-self'                                            && <span className="power-panel-name">Click one of your cards to peek</span>}
                  {powerActionMode === 'peek-other'                                           && <span className="power-panel-name">Click an opponent's card to peek</span>}
                  {powerActionMode === 'peek-any'                                             && <span className="power-panel-name">Click any card to peek</span>}
                  {powerActionMode === 'swap-first' && !powerWindow.swapSelection             && <span className="power-panel-name">Select the first card to swap</span>}
                </>
              )}
            </div>
            <div className="power-panel-right">
              <span className={`power-panel-secs${(powerPhase === 'decision' ? powerSecs <= 2 : powerSecs <= 5) ? ' power-countdown-urgent' : ''}`}>{powerSecs}s</span>
              {powerPhase === 'decision' && (
                <div className="power-decision-btns">
                  <button className="btn-primary power-yes" onClick={usePower}>Use It</button>
                  <button className="btn-ghost power-no" onClick={skipPower}>Skip</button>
                </div>
              )}
              {powerPhase === 'action' && powerType === 'double' && !powerWindow.swapSelection && !activePowerMode && (
                <div className="power-subpower-btns">
                  {powerWindow.remainingPowers?.includes('peek') && <button className="btn-secondary power-sub-btn" onClick={() => setActivePowerMode('peek')}>👁 Peek</button>}
                  {powerWindow.remainingPowers?.includes('swap') && <button className="btn-secondary power-sub-btn" onClick={() => setActivePowerMode('swap')}>🔀 Swap</button>}
                  <button className="btn-ghost power-sub-btn" onClick={skipRemaining}>Skip</button>
                </div>
              )}
              {powerPhase === 'action' && powerType === 'double' && activePowerMode && !powerWindow.swapSelection && (
                <button className="btn-ghost power-sub-btn" onClick={() => setActivePowerMode(null)}>← Back</button>
              )}
              {powerPhase === 'action' && powerType !== 'double' && (
                <button className="btn-ghost power-sub-btn" onClick={skipRemaining}>Skip</button>
              )}
            </div>
          </div>
        )}

        <PlayerCardGrid
          grid={me?.grid ?? []}
          playerId={myId}
          isActive={isMyTurn && phase === 'playing' && !playdownWindow && !giveCardWindow && !powerWindow}
          selectable={myGridSelectable}
          onSlotClick={myGridClick}
          highlightedSlot={myHighlighted}
          peekedSlots={peekedByPlayer[myId] ?? []}
          swappedSlots={swappedByPlayer[myId] ?? []}
          penaltySlots={penaltySlots.filter(s => s.playerId === myId).map(s => s.position)}
        />
      </div>

      {/* ── Game log ─────────────────────────────────────────────────────── */}
      <GameLog logs={logs} />

      {/* ── Swap animation overlay ────────────────────────────────────────── */}
      {swapAnim && (
        <SwapAnimOverlay first={swapAnim.first} second={swapAnim.second} />
      )}

      {/* ── Give-card animation overlay ───────────────────────────────────── */}
      {giveAnim && (
        <GiveCardAnim from={giveAnim.from} to={giveAnim.to} />
      )}
      {replaceAnim && (
        <GiveCardAnim from={replaceAnim.from} to={replaceAnim.to} />
      )}

      {/* ── Peek reveal overlay ──────────────────────────────────────────── */}
      {peekReveal && (
        <div className="peek-reveal-overlay" onClick={() => { setPeekReveal(null); setPeekRevealExpiresAt(null); }}>
          <div className="peek-reveal-popup" onClick={(e) => e.stopPropagation()}>
            <div className="peek-reveal-header">
              <span className="peek-reveal-eye">👁</span>
              <span className="peek-reveal-title">Peeked at {peekReveal.ownerName}</span>
              <span className={`peek-reveal-secs${peekRevealSecs <= 2 ? ' urgent' : ''}`}>{peekRevealSecs}s</span>
            </div>
            <div className="peek-reveal-card-display">
              <Card card={peekReveal.card} />
            </div>
            <div className="peek-reveal-dismiss">tap to dismiss</div>
          </div>
        </div>
      )}

      {/* ── Deal animation ───────────────────────────────────────────────── */}
      {showDeal && (
        <DealAnimation
          playerCount={players.length}
          onDone={() => setShowDeal(false)}
        />
      )}

      {/* ── End-game overlay ─────────────────────────────────────────────── */}
      {isFinished && finalResult && (
        <div className="gameover-overlay">
          <div className="gameover-card">
            <div className="gameover-title">★ KAABOO ★</div>

            <div className={`gameover-result ${finalResult.kaabooCallerWon ? 'result-win' : 'result-lose'}`}>
              <span className="result-icon">{finalResult.kaabooCallerWon ? '🏆' : '💔'}</span>
              <div>
                <div className="result-name">{playerName(finalResult.kaabooCallerId)}</div>
                <div className="result-outcome">
                  {finalResult.kaabooCallerWon
                    ? 'called Kaaboo and WON! (+1 scoreboard)'
                    : 'called Kaaboo but LOST. (-1 scoreboard)'}
                </div>
              </div>
            </div>

            <table className="score-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Card Score</th>
                  <th>Scoreboard</th>
                </tr>
              </thead>
              <tbody>
                {finalResult.scores.map((s, i) => (
                  <tr key={s.id} className={[
                    s.id === finalResult.kaabooCallerId && 'row-caller',
                    i === 0 && 'row-lowest',
                  ].filter(Boolean).join(' ')}>
                    <td>
                      {i === 0 && <span className="rank-star">★ </span>}
                      {s.name}
                      {s.id === finalResult.kaabooCallerId && (
                        <span className="caller-tag"> (Kaaboo)</span>
                      )}
                    </td>
                    <td className="score-num">{s.cardScore}</td>
                    <td className={`score-board-num ${s.scoreBoard > 0 ? 'pos' : s.scoreBoard < 0 ? 'neg' : ''}`}>
                      {s.scoreBoard > 0 ? `+${s.scoreBoard}` : s.scoreBoard}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Updated lifetime stats — refreshed from DB after game ends */}
            <StatsPanel inline />

            <div className="gameover-actions">
              {me?.isHost ? (
                <button className="btn-primary" onClick={restartGame}>Play Again</button>
              ) : (
                <span className="waiting-text">Waiting for host to restart…</span>
              )}
              <button className="btn-ghost" onClick={onLeave}>Leave</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
