import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Card } from './Card';
import { PlayerCardGrid } from './PlayerCardGrid';
import { StatsPanel } from './StatsPanel';
import { RulesModal } from './RulesModal';
import { PlayerToasts } from './PlayerToasts';
import { ChatPanel } from './ChatPanel';
import { SwapAnimOverlay, type SwapSlot } from './SwapAnimOverlay';
import { GiveCardAnim, type GiveFromSlot, type GiveToSlot } from './GiveCardAnim';
import { GameLog, type GameLogEntry } from './GameLog';
import { DealAnimation } from './DealAnimation';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore, getSocket } from '@/stores/socketStore';
import { useUiStore } from '@/stores/uiStore';
import { useCountdown } from '@/hooks/useCountdown';
import { detectGameEvents } from '@/lib/eventDetection';
import type { Card as CardType, GameState, GridPosition } from '@/types/game';
import type { ServerToClientEvents } from '@/types/socket';

const POWER_RANK_SYMBOL: Record<string, string> = { '7': '7', '8': '8', '9': '9', '10': '10', J: 'J', Q: 'Q' };

function ScoreBoardPip({ value }: { value: number }) {
  const cls = value > 0 ? 'pos' : value < 0 ? 'neg' : 'neutral';
  const label = value > 0 ? `+${value}` : String(value);
  return <span className={`sb-pip sb-pip-${cls}`} title="Scoreboard">SB {label}</span>;
}

type PowerActionMode = null | 'peek-self' | 'peek-other' | 'peek-any' | 'swap-first';
type DoublePowerPick = null | 'peek' | 'swap';

interface Rect { top: number; left: number; width: number; height: number; }

export function GamePage() {
  const navigate = useNavigate();
  const gameState = useGameStore((s) => s.gameState);
  const myId = useSocketStore((s) => s.myId);
  const connected = useSocketStore((s) => s.connected);
  const currentUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const rulesOpen = useUiStore((s) => s.rulesOpen);
  const setRulesOpen = useUiStore((s) => s.setRulesOpen);
  const chatOpen = useUiStore((s) => s.chatOpen);
  const setChatOpen = useUiStore((s) => s.setChatOpen);
  const [errorMsg, setErrorMsg] = useState('');
  useEffect(() => {
    if (!errorMsg) return;
    const t = window.setTimeout(() => setErrorMsg(''), 4000);
    return () => window.clearTimeout(t);
  }, [errorMsg]);

  const queryClient  = useQueryClient();
  const peekSecs     = useCountdown(gameState?.peekEndsAt ?? null);
  const playdownSecs = useCountdown(gameState?.playdownWindow?.endsAt ?? null);
  const giveCardSecs = useCountdown(gameState?.giveCardWindow?.endsAt ?? null);
  const powerSecs    = useCountdown(gameState?.powerWindow?.endsAt ?? null);
  const turnSecs     = useCountdown(gameState?.turnEndsAt ?? null);

  const [activePowerMode, setActivePowerMode] = useState<DoublePowerPick>(null);
  const [pendingSwap, setPendingSwap] = useState<{ ownerId: string; gridPosition: string }[]>([]);
  const [chatUnread, setChatUnread] = useState(0);

  const [peekReveal, setPeekReveal] = useState<{ card: CardType; ownerName: string } | null>(null);
  const [peekRevealExpiresAt, setPeekRevealExpiresAt] = useState<number | null>(null);
  const peekRevealSecs = useCountdown(peekRevealExpiresAt);

  const [showDeal, setShowDeal] = useState(false);
  const prevPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevPhaseRef.current === null && gameState?.phase === 'dealing') setShowDeal(true);
    prevPhaseRef.current = gameState?.phase ?? null;
  }, [gameState?.phase]);

  const prevStateRef = useRef<GameState | null>(null);
  const [swapAnim, setSwapAnim] = useState<{ first: SwapSlot; second: SwapSlot } | null>(null);
  const [giveAnim, setGiveAnim] = useState<{ from: GiveFromSlot; to: GiveToSlot } | null>(null);
  const [replaceAnim, setReplaceAnim] = useState<{ from: GiveFromSlot; to: GiveToSlot } | null>(null);
  const [replacedSlot, setReplacedSlot] = useState<{ playerId: string; position: string } | null>(null);
  const [penaltyMsg, setPenaltyMsg] = useState(false);
  const [penaltySlots, setPenaltySlots] = useState<{ playerId: string; position: string }[]>([]);
  const [logs, setLogs] = useState<GameLogEntry[]>([]);
  const logIdRef = useRef(0);

  const drawnCardRectRef = useRef<Rect | null>(null);
  const pendingReplaceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gameState?.powerWindow || gameState.powerWindow.phase !== 'action') setActivePowerMode(null);
  }, [gameState?.powerWindow?.phase]);

  useEffect(() => {
    if (!gameState?.powerWindow || gameState.powerWindow.phase !== 'action') {
      setPendingSwap([]);
    }
  }, [gameState?.powerWindow?.phase]);

  const HIGHLIGHT_FADE_MS = 3000;
  const [peekedAt, setPeekedAt] = useState<Record<string, number>>({});
  const [swapSelectedAt, setSwapSelectedAt] = useState<Record<string, number>>({});
  const [, setHighlightTick] = useState(0);

  const isDoublePower = gameState?.powerWindow?.powerType === 'double';

  useEffect(() => {
    if (!isDoublePower) {
      if (Object.keys(peekedAt).length > 0) setPeekedAt({});
      return;
    }
    const peeked = gameState?.powerWindow?.peekedCards ?? [];
    const liveKeys = new Set(peeked.map((p) => `${p.ownerId}|${p.position}`));
    setPeekedAt((prev) => {
      const next: Record<string, number> = {};
      const now = Date.now();
      let changed = false;
      for (const k of liveKeys) {
        if (prev[k] !== undefined) next[k] = prev[k];
        else { next[k] = now; changed = true; }
      }
      for (const k of Object.keys(prev)) {
        if (!liveKeys.has(k)) { changed = true; }
      }
      return changed || Object.keys(next).length !== Object.keys(prev).length ? next : prev;
    });
  }, [isDoublePower, gameState?.powerWindow?.peekedCards]);

  useEffect(() => {
    if (!isDoublePower) {
      if (Object.keys(swapSelectedAt).length > 0) setSwapSelectedAt({});
      return;
    }
    const fromServer = gameState?.powerWindow?.swapSelection ?? [];
    const fromLocal  = pendingSwap;
    const liveKeys = new Set([
      ...fromServer.map((s) => `${s.playerId}|${s.gridPosition}`),
      ...fromLocal.map((s) => `${s.ownerId}|${s.gridPosition}`),
    ]);
    setSwapSelectedAt((prev) => {
      const next: Record<string, number> = {};
      const now = Date.now();
      let changed = false;
      for (const k of liveKeys) {
        if (prev[k] !== undefined) next[k] = prev[k];
        else { next[k] = now; changed = true; }
      }
      for (const k of Object.keys(prev)) {
        if (!liveKeys.has(k)) { changed = true; }
      }
      return changed || Object.keys(next).length !== Object.keys(prev).length ? next : prev;
    });
  }, [isDoublePower, gameState?.powerWindow?.swapSelection, pendingSwap]);

  useEffect(() => {
    const stamps = [...Object.values(peekedAt), ...Object.values(swapSelectedAt)];
    if (stamps.length === 0) return;
    const now = Date.now();
    const nextExpiry = Math.min(...stamps.map((t) => t + HIGHLIGHT_FADE_MS));
    const delay = Math.max(0, nextExpiry - now);
    const id = window.setTimeout(() => setHighlightTick((t) => t + 1), delay + 16);
    return () => window.clearTimeout(id);
  }, [peekedAt, swapSelectedAt]);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = gameState;
    if (!gameState || !myId) return;

    if (!prev?.lastSwap && gameState.lastSwap) {
      const swap = gameState.lastSwap;
      const el1 = document.querySelector(`[data-player="${swap.first.playerId}"][data-slot="${swap.first.position}"]`);
      const el2 = document.querySelector(`[data-player="${swap.second.playerId}"][data-slot="${swap.second.position}"]`);
      if (el1 && el2) {
        const rect1 = el1.getBoundingClientRect();
        const rect2 = el2.getBoundingClientRect();
        const prevCard1 = prev?.players?.find((p) => p.id === swap.first.playerId)
          ?.grid?.find((s) => s.position === swap.first.position)?.card ?? null;
        const prevCard2 = prev?.players?.find((p) => p.id === swap.second.playerId)
          ?.grid?.find((s) => s.position === swap.second.position)?.card ?? null;
        setSwapAnim({ first: { rect: rect1, card: prevCard1 }, second: { rect: rect2, card: prevCard2 } });
        window.setTimeout(() => setSwapAnim(null), 1100);
      }
    }

    if (prev?.giveCardWindow && !gameState.giveCardWindow && gameState.phase !== 'finished') {
      const { giverId, receiverId } = prev.giveCardWindow;
      const prevGiver = prev.players?.find((p) => p.id === giverId);
      const curGiver  = gameState.players?.find((p) => p.id === giverId);
      let givenPos: string | null = null;
      let givenCard: CardType | null = null;
      for (const ps of prevGiver?.grid ?? []) {
        if (ps.hasCard) {
          const cs = curGiver?.grid?.find((s) => s.position === ps.position);
          if (cs && !cs.hasCard) { givenPos = ps.position; givenCard = ps.card ?? null; break; }
        }
      }
      const prevRecvPos = new Set(prev.players?.find((p) => p.id === receiverId)?.grid?.map((s) => s.position) ?? []);
      const newRecvSlot = gameState.players?.find((p) => p.id === receiverId)?.grid?.find((s) => !prevRecvPos.has(s.position));
      if (givenPos && newRecvSlot) {
        const srcEl = document.querySelector(`[data-player="${giverId}"][data-slot="${givenPos}"]`);
        const dstEl = document.querySelector(`[data-player="${receiverId}"][data-slot="${newRecvSlot.position}"]`);
        if (srcEl && dstEl) {
          setGiveAnim({ from: { rect: srcEl.getBoundingClientRect(), card: givenCard }, to: { rect: dstEl.getBoundingClientRect() } });
          window.setTimeout(() => setGiveAnim(null), 1100);
        }
      }
    }

    const prevHand = prev?.myHand ?? [];
    const currHand = gameState.myHand ?? [];
    if (prevHand.length > 0 && currHand.length === 0) {
      const drawnCard = prevHand[0] ?? null;
      const pos = pendingReplaceRef.current;
      pendingReplaceRef.current = null;
      if (pos && drawnCard) {
        const fromRect = drawnCardRectRef.current;
        const toEl = document.querySelector(`[data-player="${myId}"][data-slot="${pos}"]`);
        if (fromRect && toEl) {
          setReplaceAnim({ from: { rect: fromRect, card: drawnCard }, to: { rect: toEl.getBoundingClientRect() } });
          window.setTimeout(() => setReplaceAnim(null), 800);
        }
      }
    }

    if (!prev?.lastReplace && gameState.lastReplace) {
      const { playerId: rId, position: rPos } = gameState.lastReplace;
      setReplacedSlot({ playerId: rId, position: rPos });
      window.setTimeout(() => setReplacedSlot(null), 2000);
    }

    const wasOpen = prev?.playdownWindow && !prev.playdownWindow.claimed;
    const nowClaimed = Boolean(gameState.playdownWindow?.claimed) || (!gameState.playdownWindow && wasOpen);
    if (wasOpen && nowClaimed) {
      for (const currP of gameState.players) {
        const prevP = prev?.players?.find((p) => p.id === currP.id);
        const lostSlot = prevP?.grid?.find((ps) =>
          ps.card && !currP.grid.find((s) => s.position === ps.position)?.card,
        );
        if (lostSlot) {
          const fromEl = document.querySelector(`[data-player="${currP.id}"][data-slot="${lostSlot.position}"]`);
          const toEl = document.querySelector('.discard-pile');
          if (fromEl && toEl) {
            setReplaceAnim({ from: { rect: fromEl.getBoundingClientRect(), card: lostSlot.card }, to: { rect: toEl.getBoundingClientRect() } });
            window.setTimeout(() => setReplaceAnim(null), 800);
          }
          break;
        }
      }
    }

    if (gameState.phase === 'playing' && prev?.phase === 'playing') {
      for (const curP of gameState.players) {
        const prevP = prev?.players?.find((pp) => pp.id === curP.id);
        const prevPos = new Set(prevP?.grid?.map((s) => s.position) ?? []);
        const newSlot = curP.grid.find((s) => s.hasCard && !prevPos.has(s.position));
        if (newSlot) {
          const entry = { playerId: curP.id, position: newSlot.position };
          setPenaltySlots((ps) => [...ps, entry]);
          window.setTimeout(
            () => setPenaltySlots((ps) => ps.filter((s) => !(s.playerId === entry.playerId && s.position === entry.position))),
            3000,
          );
        }
      }
    }

    const entries = detectGameEvents(prev, gameState, myId);
    if (entries.length > 0) {
      const shouldClear = entries.some((e) => e.clearBefore);
      setLogs((prevLogs) => {
        const base = shouldClear ? [] : prevLogs;
        return [
          ...base,
          ...entries.map((e) => ({ id: ++logIdRef.current, text: e.text, type: e.type })),
        ];
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  useEffect(() => {
    if (peekRevealSecs === 0 && peekRevealExpiresAt !== null && Date.now() >= peekRevealExpiresAt) {
      setPeekReveal(null);
      setPeekRevealExpiresAt(null);
    }
  }, [peekRevealSecs, peekRevealExpiresAt]);

  useEffect(() => {
    if (!myId) return;
    let lastCount = 0;
    let lastPlayerId: string | null = null;

    const handler: ServerToClientEvents['game-state'] = (state) => {
      const pw = state.powerWindow;
      if (!pw) { lastCount = 0; lastPlayerId = null; return; }
      if (pw.playerId !== lastPlayerId) { lastCount = 0; lastPlayerId = pw.playerId; }
      const peeked = pw.peekedCards ?? [];
      if (pw.playerId === myId && pw.phase === 'action' && peeked.length > lastCount) {
        const newest = peeked[peeked.length - 1]!;
        const owner = state.players?.find((p) => p.id === newest.ownerId);
        const slot = owner?.grid?.find((s) => s.position === newest.position);
        if (slot?.card && owner) {
          const ownerName = owner.id === myId ? 'your own card' : `${owner.name}'s card`;
          flushSync(() => {
            setPeekReveal({ card: slot.card!, ownerName });
            setPeekRevealExpiresAt(Date.now() + 5000);
          });
        }
      }
      lastCount = peeked.length;
    };

    const socket = getSocket();
    socket.on('game-state', handler);
    socket.on('stats-ready', () => queryClient.invalidateQueries({ queryKey: ['stats', 'me'] }));
    return () => { socket.off('game-state', handler); socket.off('stats-ready'); };
  }, [myId, queryClient]);

  useLayoutEffect(() => {
    if (!gameState || !myId) return;
    const hasHand = (gameState.myHand?.length ?? 0) > 0;
    if (hasHand && gameState.currentTurnPlayerId === myId) {
      const el = document.querySelector('.drawn-card-area');
      if (el) drawnCardRectRef.current = el.getBoundingClientRect();
    }
  });

  if (!gameState || !myId) return <div className="loading">Loading game…</div>;

  const {
    players, myHand, phase, deckSize, discardPile,
    currentTurnPlayerId, turnOrder,
    playdownWindow, giveCardWindow, powerWindow,
    kaabooCallerId, finalResult, lastSwap,
  } = gameState;

  const peekedByPlayer: Record<string, string[]> = {};
  if (powerWindow?.peekedCards) {
    const now = Date.now();
    for (const { ownerId, position } of powerWindow.peekedCards) {
      if (isDoublePower) {
        const at = peekedAt[`${ownerId}|${position}`];
        if (at !== undefined && now - at >= HIGHLIGHT_FADE_MS) continue;
      }
      (peekedByPlayer[ownerId] ??= []).push(position);
    }
  }
  const swappedByPlayer: Record<string, string[]> = {};
  if (lastSwap) {
    (swappedByPlayer[lastSwap.first.playerId] ??= []).push(lastSwap.first.position);
    (swappedByPlayer[lastSwap.second.playerId] ??= []).push(lastSwap.second.position);
  }

  const isMyTurn     = currentTurnPlayerId === myId;
  const isPeek       = phase === 'peek';
  const isFinished   = phase === 'finished';
  const drawnCard    = myHand?.[0] ?? null;
  const hasDrawnCard = Boolean(drawnCard);
  const needsToDraw  = isMyTurn && !hasDrawnCard && !playdownWindow && !giveCardWindow && !powerWindow && !isFinished;

  const kaabooAlreadyCalled  = Boolean(kaabooCallerId);
  const amKaabooCallerBadge  = kaabooCallerId === myId;
  const isEligiblePlaydown   = Boolean(playdownWindow && !playdownWindow.claimed && playdownWindow.eligiblePlayers?.includes(myId));
  const isGiveCardGiver      = giveCardWindow?.giverId === myId;
  const isGiveCardReceiver   = giveCardWindow?.receiverId === myId;
  const isMyPower            = powerWindow?.playerId === myId;
  const powerPhase           = powerWindow?.phase;
  const powerType            = powerWindow?.powerType;

  const me     = players.find((p) => p.id === myId);
  const others = (turnOrder ?? [])
    .filter((id) => id !== myId)
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const topDiscard = discardPile?.at(-1) ?? null;

  const powerActionMode: PowerActionMode = (() => {
    if (!isMyPower || powerPhase !== 'action' || !powerWindow) return null;
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

  const socket = getSocket();
  const onErr = (msg?: string) => { if (msg) setErrorMsg(msg); };

  const drawCard      = () => socket.emit('draw-card', (r) => onErr(r?.error));
  const discardDrawn  = () => socket.emit('discard-drawn-card', (r) => onErr(r?.error));
  const replaceGrid = (pos: string) => {
    pendingReplaceRef.current = pos;
    socket.emit('replace-grid-card', { gridPosition: pos as GridPosition }, (r) => {
      if (r?.error) { pendingReplaceRef.current = null; onErr(r.error); }
    });
  };
  const playDown = (ownerId: string, pos: string) =>
    socket.emit('play-down', { cardOwnerId: ownerId, gridPosition: pos as GridPosition }, (r) => {
      if (r?.error) onErr(r.error);
      if (r?.ok === false && r?.penalty) {
        setPenaltyMsg(true);
        window.setTimeout(() => setPenaltyMsg(false), 2500);
      }
    });
  const giveCard  = (pos: string) => socket.emit('give-card', { gridPosition: pos as GridPosition }, (r) => onErr(r?.error));
  const callKaaboo = () => socket.emit('call-kaaboo', (r) => onErr(r?.error));
  const restartGame = () => socket.emit('start-game', (r) => onErr(r?.error));
  const usePower   = () => socket.emit('power-decision', { use: true }, (r) => onErr(r?.error));
  const skipPower  = () => socket.emit('power-decision', { use: false }, (r) => onErr(r?.error));
  const skipRemaining = () => socket.emit('power-skip', (r) => onErr(r?.error));
  const powerPeekCard = (tId: string, pos: string) =>
    socket.emit('power-peek', { targetPlayerId: tId, gridPosition: pos as GridPosition }, (r) => {
      if (r?.error) return onErr(r.error);
      setActivePowerMode(null);
    });
  const selectSwapCard = (ownerId: string, gridPosition: string) => {
    setPendingSwap((prev) => {
      let next: { ownerId: string; gridPosition: string }[];
      if (prev.some((s) => s.ownerId === ownerId && s.gridPosition === gridPosition)) {
        next = prev.filter((s) => !(s.ownerId === ownerId && s.gridPosition === gridPosition));
      } else {
        next = [...prev, { ownerId, gridPosition }];
        if (next.length > 2) next = next.slice(1);
      }
      socket.emit('power-swap-preview', {
        selections: next.map((s) => ({ playerId: s.ownerId, gridPosition: s.gridPosition as GridPosition })),
      });
      return next;
    });
  };
  const swapReady = pendingSwap.length === 2 && pendingSwap[0].ownerId !== pendingSwap[1].ownerId;
  const confirmSwap = () => {
    if (!swapReady) return;
    socket.emit('power-swap-confirm', {
      card1: { ownerId: pendingSwap[0].ownerId, gridPosition: pendingSwap[0].gridPosition as GridPosition },
      card2: { ownerId: pendingSwap[1].ownerId, gridPosition: pendingSwap[1].gridPosition as GridPosition },
    }, (r) => {
      if (r?.error) onErr(r.error);
      setPendingSwap([]);
    });
  };

  const handleLeave = () => {
    socket.emit('leave-room');
    useGameStore.getState().reset();
    navigate('/lobby');
  };

  const myGridSelectable = Boolean(
    (hasDrawnCard && isMyTurn) || isEligiblePlaydown || isGiveCardGiver ||
    (powerActionMode && ['peek-self', 'peek-any', 'swap-first'].includes(powerActionMode)),
  );
  const oppSelectable = Boolean(
    isEligiblePlaydown ||
    (powerActionMode && ['peek-other', 'peek-any', 'swap-first'].includes(powerActionMode)),
  );
  const myGridClick: ((p: string) => void) | undefined = (() => {
    if (isGiveCardGiver) return giveCard;
    if (isEligiblePlaydown) return (p: string) => playDown(myId, p);
    if (powerActionMode && ['peek-self', 'peek-any'].includes(powerActionMode)) return (p: string) => powerPeekCard(myId, p);
    if (powerActionMode === 'swap-first') return (p: string) => selectSwapCard(myId, p);
    if (hasDrawnCard && isMyTurn) return replaceGrid;
    return undefined;
  })();
  const oppClick = (oid: string): ((p: string) => void) | undefined => {
    if (isEligiblePlaydown) return (p: string) => playDown(oid, p);
    if (powerActionMode && ['peek-other', 'peek-any'].includes(powerActionMode)) return (p: string) => powerPeekCard(oid, p);
    if (powerActionMode === 'swap-first') return (p: string) => selectSwapCard(oid, p);
    return undefined;
  };
  const myGridHint = (() => {
    if (isGiveCardGiver) return 'Choose a card to give away';
    if (isEligiblePlaydown) return 'Play your own card down';
    if (powerActionMode === 'peek-self')  return 'Click a card to peek at it';
    if (powerActionMode === 'peek-any')   return 'Click any of your cards to peek';
    if (powerActionMode === 'swap-first') return pendingSwap.length === 0 ? 'Select first card to swap' : 'Select second card to swap';
    if (hasDrawnCard && isMyTurn) return 'Click a card to replace it';
    return null;
  })();

  const swapHighlightSlots = (id: string): string[] => {
    const now = Date.now();
    const isFresh = (key: string) => {
      if (!isDoublePower) return true;
      const at = swapSelectedAt[key];
      return at === undefined || now - at < HIGHLIGHT_FADE_MS;
    };
    const fromServer = (powerWindow?.swapSelection ?? [])
      .filter((s) => s.playerId === id && isFresh(`${s.playerId}|${s.gridPosition}`))
      .map((s) => s.gridPosition);
    const fromLocal  = pendingSwap
      .filter((s) => s.ownerId === id && isFresh(`${s.ownerId}|${s.gridPosition}`))
      .map((s) => s.gridPosition);
    return [...new Set([...fromServer, ...fromLocal])];
  };
  const myHighlightedSlots  = swapHighlightSlots(myId);
  const oppHighlightedSlots = (oid: string) => swapHighlightSlots(oid);

  const playerName = (id: string | null | undefined) => players.find((p) => p.id === id)?.name ?? '…';

  return (
    <div className="gameboard">
      {!connected && (
        <div className="reconnect-banner" role="status" aria-live="polite">
          <span className="reconnect-icon" aria-hidden="true">
            <span className="reconnect-arc" />
            <span className="reconnect-arc" />
            <span className="reconnect-arc" />
          </span>
          <span>Reconnecting…</span>
        </div>
      )}
      {errorMsg && <div className="error-banner">{errorMsg}</div>}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      <PlayerToasts players={players} />
      <ChatPanel
        myName={currentUser?.username ?? ''}
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        onUnread={() => setChatUnread((n) => n + 1)}
      />

      <header className="game-header">
        <span className="title-small">Kaaboo</span>
        <span className="room-code-small">#{gameState.roomId}</span>
        {gameState.roundNumber > 0 && <span className="round-badge">Round {gameState.roundNumber}</span>}
        {isMyTurn && phase === 'playing' && !playdownWindow && !giveCardWindow && !powerWindow && (
          <span className="header-turn-badge your-turn-badge">Your turn</span>
        )}
        {currentUser && <span className="header-username">{currentUser.username}</span>}
        <button
          className="btn-ghost btn-chat"
          onClick={() => { setChatOpen(!chatOpen); setChatUnread(0); }}
          title="Chat"
        >
          💬{chatUnread > 0 && <span className="chat-unread-badge">{chatUnread}</span>}
        </button>
        <button className="btn-ghost btn-rules-help" onClick={() => setRulesOpen(true)} title="Rules & Powers">?</button>
        <button className="btn-ghost btn-leave" onClick={handleLeave}>Leave</button>
        <button className="btn-ghost" style={{ marginLeft: '6px' }} onClick={logout}>Log Out</button>
      </header>

      {kaabooCallerId && !isFinished && (
        <div className="kaaboo-active-banner">
          <span className="kaaboo-star">★</span>
          <span><strong>{playerName(kaabooCallerId)}</strong> called KAABOO! Game ends when their turn comes around.</span>
        </div>
      )}

      {isPeek && (
        <div className="peek-banner">
          <span className="peek-icon">👁</span>
          <span>Memorise your <strong>bottom two cards</strong> — hiding in{' '}
            <span className={`peek-countdown${peekSecs <= 3 ? ' peek-countdown-urgent' : ''}`}>{peekSecs}s</span>
          </span>
        </div>
      )}

      {playdownWindow && !playdownWindow.claimed && (
        <div className={`playdown-banner${isEligiblePlaydown ? ' playdown-eligible' : ''}`}>
          <div className="pd-timer-col">
            <span className="pd-timer-label">Time left</span>
            <span className={`pd-countdown${playdownSecs <= 1 ? ' pd-countdown-urgent' : ''}`}>{playdownSecs}</span>
          </div>
          <div className="pd-body">
            <span className="pd-main-text">⚡ Play a <strong>{playdownWindow.topCardRank}</strong> to play down!</span>
            {isEligiblePlaydown
              ? <span className="pd-eligible-hint">Click any matching card — yours or an opponent's</span>
              : <span className="pd-ineligible-badge">✕ Not eligible this turn</span>}
          </div>
        </div>
      )}

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

      {powerWindow && !isMyPower && (
        <div className="power-banner">
          <div className="power-rank-badge power-rank-dim">{POWER_RANK_SYMBOL[powerWindow.cardRank]}</div>
          {powerPhase === 'decision'
            ? <span><strong>{playerName(powerWindow.playerId)}</strong> may use their <strong>{powerWindow.cardRank}</strong> power… <span className="power-countdown">{powerSecs}s</span></span>
            : <span><strong>{playerName(powerWindow.playerId)}</strong> is using their <strong>{powerWindow.cardRank}</strong> power… <span className="power-countdown">{powerSecs}s</span></span>}
        </div>
      )}

      {lastSwap && (
        <div className="swap-banner">
          <span className="swap-banner-icon">🔀</span>
          <span><strong>{lastSwap.swapperName}</strong> swapped two cards!</span>
        </div>
      )}

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
              highlightedSlots={oppHighlightedSlots(p.id)}
              peekedSlots={peekedByPlayer[p.id] ?? []}
              swappedSlots={swappedByPlayer[p.id] ?? []}
              penaltySlots={penaltySlots.filter((s) => s.playerId === p.id).map((s) => s.position)}
              replacedSlots={replacedSlot?.playerId === p.id ? [replacedSlot.position] : []}
            />
            {p.handSize > 0 && <div className="opponent-deciding">deciding…</div>}
            {p.id === currentTurnPlayerId && phase === 'playing' && !playdownWindow && !giveCardWindow && !powerWindow && turnSecs > 0 && (
              <span className={`turn-countdown-badge${turnSecs <= 5 ? ' turn-countdown-urgent' : ''}`}>{turnSecs}s</span>
            )}
            <ScoreBoardPip value={p.sessionScoreBoard ?? 0} />
          </div>
        ))}
      </div>

      <div className="table-centre">
        <div className="pile-container">
          <div className="pile-label">Deck ({deckSize})</div>
          <div className={`deck-pile${needsToDraw ? ' deck-clickable' : ''}`} onClick={needsToDraw ? drawCard : undefined}>
            {deckSize > 0 ? <Card faceDown /> : <div className="empty-pile">Empty</div>}
          </div>
          {needsToDraw && (
            <div className="draw-actions">
              <div className="pile-hint" onClick={drawCard} style={{ cursor: 'pointer' }}>Click to draw</div>
              {!kaabooAlreadyCalled && (
                <button className="btn-kaaboo" onClick={callKaaboo}>★ Kaaboo!</button>
              )}
            </div>
          )}
        </div>

        {hasDrawnCard && isMyTurn && drawnCard && (
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

      <div className="my-area">
        <div className="my-area-header">
          <span className="my-area-label">
            {amKaabooCallerBadge && <span className="kaaboo-caller-badge">★ KAABOO</span>}
            {me?.name ?? 'You'}{me?.isHost && ' 👑'}
          </span>
          <ScoreBoardPip value={me?.sessionScoreBoard ?? 0} />
          {isPeek && <span className="peek-hint">Bottom cards visible for {peekSecs}s</span>}
          {!isPeek && myGridHint && <span className="action-hint">{myGridHint}</span>}
          {isMyTurn && phase === 'playing' && !playdownWindow && !giveCardWindow && !powerWindow && turnSecs > 0 && (
            <span className={`turn-countdown-badge${turnSecs <= 5 ? ' turn-countdown-urgent' : ''}`}>{turnSecs}s</span>
          )}
        </div>

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
                  {powerType === 'double' && !activePowerMode                                                     && <span className="power-panel-name">Choose your action</span>}
                  {powerActionMode === 'peek-self'                                                                && <span className="power-panel-name">Click one of your cards to peek</span>}
                  {powerActionMode === 'peek-other'                                                               && <span className="power-panel-name">Click an opponent's card to peek</span>}
                  {powerActionMode === 'peek-any'                                                                 && <span className="power-panel-name">Click any card to peek</span>}
                  {powerActionMode === 'swap-first' && pendingSwap.length === 0                                   && <span className="power-panel-name">Select first card to swap</span>}
                  {powerActionMode === 'swap-first' && pendingSwap.length === 1                                   && <span className="power-panel-name">Select second card to swap</span>}
                  {powerActionMode === 'swap-first' && pendingSwap.length === 2 && !swapReady                    && <span className="power-panel-name">Cards must belong to different players</span>}
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
              {powerPhase === 'action' && powerType === 'double' && !activePowerMode && (
                <div className="power-subpower-btns">
                  {powerWindow.remainingPowers?.includes('peek') && <button className="btn-secondary power-sub-btn" onClick={() => setActivePowerMode('peek')}>👁 Peek</button>}
                  {powerWindow.remainingPowers?.includes('swap') && <button className="btn-secondary power-sub-btn" onClick={() => setActivePowerMode('swap')}>🔀 Swap</button>}
                  <button className="btn-ghost power-sub-btn" onClick={skipRemaining}>Skip</button>
                </div>
              )}
              {powerPhase === 'action' && powerType === 'double' && activePowerMode === 'swap' && (
                <div className="power-subpower-btns">
                  <button className="btn-primary power-sub-btn" disabled={!swapReady} onClick={confirmSwap}>{swapReady ? 'Swap' : 'Waiting…'}</button>
                  <button className="btn-ghost power-sub-btn" onClick={skipRemaining}>Skip</button>
                  <button className="btn-ghost power-sub-btn" onClick={() => { setActivePowerMode(null); setPendingSwap([]); }}>← Back</button>
                </div>
              )}
              {powerPhase === 'action' && powerType === 'double' && activePowerMode === 'peek' && (
                <button className="btn-ghost power-sub-btn" onClick={() => setActivePowerMode(null)}>← Back</button>
              )}
              {powerPhase === 'action' && powerType === 'swap' && (
                <div className="power-subpower-btns">
                  <button className="btn-primary power-sub-btn" disabled={!swapReady} onClick={confirmSwap}>{swapReady ? 'Swap' : 'Waiting…'}</button>
                  <button className="btn-ghost power-sub-btn" onClick={skipRemaining}>Skip</button>
                </div>
              )}
              {powerPhase === 'action' && powerType === 'peek-self' && (
                <button className="btn-ghost power-sub-btn" onClick={skipRemaining}>Skip</button>
              )}
              {powerPhase === 'action' && powerType === 'peek-other' && (
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
          highlightedSlots={myHighlightedSlots}
          peekedSlots={peekedByPlayer[myId] ?? []}
          swappedSlots={swappedByPlayer[myId] ?? []}
          penaltySlots={penaltySlots.filter((s) => s.playerId === myId).map((s) => s.position)}
          replacedSlots={replacedSlot?.playerId === myId ? [replacedSlot.position] : []}
        />
      </div>

      <GameLog logs={logs} />

      {swapAnim && <SwapAnimOverlay first={swapAnim.first} second={swapAnim.second} />}
      {giveAnim && <GiveCardAnim from={giveAnim.from} to={giveAnim.to} />}
      {replaceAnim && <GiveCardAnim from={replaceAnim.from} to={replaceAnim.to} />}
      {penaltyMsg && <div className="playdown-fail-toast">Wrong card — penalty added!</div>}

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

      {showDeal && (
        <DealAnimation
          playerCount={players.length}
          onDone={() => setShowDeal(false)}
        />
      )}

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

            <div className="score-table-wrap">
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
            </div>

            <StatsPanel inline />

            <div className="gameover-actions">
              {me?.isHost ? (
                <button className="btn-primary" onClick={restartGame}>Play Again</button>
              ) : (
                <span className="waiting-text">Waiting for host to restart…</span>
              )}
              <button className="btn-ghost" onClick={handleLeave}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

