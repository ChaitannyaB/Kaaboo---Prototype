import { useState, useEffect, useRef } from 'react';
import socket from '../socket';
import Card from './Card';
import PlayerCardGrid from './PlayerCardGrid';
import StatsPanel from './StatsPanel';
import RulesModal from './RulesModal';
import PlayerToasts from './PlayerToasts';
import ChatPanel from './ChatPanel';

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
          <span className="pd-icon">⚡</span>
          <span>
            Play a <strong>{playdownWindow.topCardRank}</strong> to play down!{' '}
            <span className={`pd-countdown${playdownSecs <= 1 ? ' pd-countdown-urgent' : ''}`}>{playdownSecs}s</span>
          </span>
          {isEligiblePlaydown
            ? <span className="pd-eligible-hint">Click any card — yours or an opponent's</span>
            : <span className="pd-ineligible-hint">Not eligible this round</span>}
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

      {/* Power banners */}
      {powerWindow && powerPhase === 'decision' && (
        isMyPower ? (
          <div className="power-banner power-decision-mine">
            <div className="power-rank-badge">{POWER_RANK_SYMBOL[powerWindow.cardRank]}</div>
            <div className="power-text">
              <span className="power-label">{powerWindow.powerLabel}</span>
              <span className="power-subtext">Use your power?{' '}
                <span className={`power-countdown${powerSecs <= 2 ? ' power-countdown-urgent' : ''}`}>{powerSecs}s</span>
              </span>
            </div>
            <div className="power-decision-btns">
              <button className="btn-primary power-yes" onClick={usePower}>Use It</button>
              <button className="btn-ghost power-no" onClick={skipPower}>Skip</button>
            </div>
          </div>
        ) : (
          <div className="power-banner power-decision-other">
            <div className="power-rank-badge power-rank-dim">{POWER_RANK_SYMBOL[powerWindow.cardRank]}</div>
            <span><strong>{playerName(powerWindow.playerId)}</strong> may use their <strong>{powerWindow.cardRank}</strong> power… <span className="power-countdown">{powerSecs}s</span></span>
          </div>
        )
      )}

      {powerWindow && powerPhase === 'action' && (
        <div className={`power-banner power-action${isMyPower ? ' power-action-mine' : ''}`}>
          <div className="power-rank-badge">{POWER_RANK_SYMBOL[powerWindow.cardRank]}</div>
          <div className="power-text">
            {isMyPower ? (
              <>
                {powerType === 'double' && !powerWindow.swapSelection && !activePowerMode && <span className="power-label">Choose your action</span>}
                {powerWindow.swapSelection && <span className="power-label">Select the second card to swap</span>}
                {powerActionMode === 'peek-self'  && <span className="power-label">Click one of YOUR cards to peek</span>}
                {powerActionMode === 'peek-other' && <span className="power-label">Click an OPPONENT'S card to peek</span>}
                {powerActionMode === 'peek-any'   && <span className="power-label">Click any card to peek at it</span>}
                {powerActionMode === 'swap-first' && !powerWindow.swapSelection && <span className="power-label">Select the first card to swap</span>}
                <span className="power-subtext">
                  <span className={`power-countdown${powerSecs <= 5 ? ' power-countdown-urgent' : ''}`}>{powerSecs}s</span> remaining
                </span>
              </>
            ) : (
              <span className="power-label"><strong>{playerName(powerWindow.playerId)}</strong> is using their {powerWindow.cardRank} power… <span className="power-countdown">{powerSecs}s</span></span>
            )}
          </div>
          {isMyPower && powerType === 'double' && !powerWindow.swapSelection && !activePowerMode && (
            <div className="power-subpower-btns">
              {powerWindow.remainingPowers?.includes('peek') && <button className="btn-secondary power-sub-btn" onClick={() => setActivePowerMode('peek')}>👁 Peek</button>}
              {powerWindow.remainingPowers?.includes('swap') && <button className="btn-secondary power-sub-btn" onClick={() => setActivePowerMode('swap')}>🔀 Swap</button>}
              <button className="btn-ghost power-sub-btn" onClick={skipRemaining}>Skip</button>
            </div>
          )}
          {isMyPower && powerType === 'double' && activePowerMode && !powerWindow.swapSelection && (
            <button className="btn-ghost power-sub-btn" onClick={() => setActivePowerMode(null)}>← Back</button>
          )}
          {isMyPower && powerType !== 'double' && (
            <button className="btn-ghost power-sub-btn" onClick={skipRemaining}>Skip</button>
          )}
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
            {topDiscard ? <Card card={topDiscard} /> : <div className="empty-pile">Empty</div>}
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
        <PlayerCardGrid
          grid={me?.grid ?? []}
          isActive={isMyTurn && phase === 'playing' && !playdownWindow && !giveCardWindow && !powerWindow}
          selectable={myGridSelectable}
          onSlotClick={myGridClick}
          highlightedSlot={myHighlighted}
          peekedSlots={peekedByPlayer[myId] ?? []}
          swappedSlots={swappedByPlayer[myId] ?? []}
        />
      </div>

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
