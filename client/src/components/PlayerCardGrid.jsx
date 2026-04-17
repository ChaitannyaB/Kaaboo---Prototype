import Card from './Card';

function getSlotPlacement(position) {
  switch (position) {
    case 'top-left':     return { gridColumn: 1, gridRow: 1 };
    case 'top-right':    return { gridColumn: 2, gridRow: 1 };
    case 'bottom-left':  return { gridColumn: 1, gridRow: 2 };
    case 'bottom-right': return { gridColumn: 2, gridRow: 2 };
    default: {
      // extra-0 → col 3 row 1, extra-1 → col 3 row 2, extra-2 → col 4 row 1, …
      const idx = parseInt(position.replace('extra-', ''), 10) || 0;
      return { gridColumn: 3 + Math.floor(idx / 2), gridRow: 1 + (idx % 2) };
    }
  }
}

/**
 * Props:
 *   grid             — [{ position, card|null, hasCard }]
 *   small            — smaller cards (opponents)
 *   label            — text above grid
 *   isActive         — gold outline (current turn)
 *   selectable       — slots with cards are clickable
 *   onSlotClick      — (position) => void
 *   hint             — optional text below grid when selectable
 *   highlightedSlot  — position being selected for swap (first pick, purple ring)
 *   peekedSlots      — array of positions currently being peeked (purple glow, eye)
 *   swappedSlots     — array of positions just swapped (gold flash animation)
 */
export default function PlayerCardGrid({
  grid = [], small, label, isActive, selectable, onSlotClick, hint,
  highlightedSlot, peekedSlots = [], swappedSlots = [], penaltySlots = [], playerId,
}) {
  const peekedSet  = new Set(peekedSlots);
  const swappedSet = new Set(swappedSlots);
  const penaltySet = new Set(penaltySlots);

  return (
    <div className={[
      'player-grid-wrap',
      isActive && 'player-grid-active',
      selectable && 'player-grid-selectable',
    ].filter(Boolean).join(' ')}>

      {label && <div className="player-grid-label">{label}</div>}

      <div className={['card-grid', small && 'card-grid-small'].filter(Boolean).join(' ')}>
        {grid.map((slot) => {
          const canClick = selectable && slot.hasCard && onSlotClick;
          return (
            <div
              key={slot.position}
              data-player={playerId}
              data-slot={slot.position}
              style={getSlotPlacement(slot.position)}
              className={[
                'card-slot-wrap',
                canClick && 'card-slot-target',
                slot.position === highlightedSlot && 'card-slot-highlighted',
                peekedSet.has(slot.position)   && 'card-slot-peeked',
                swappedSet.has(slot.position)  && 'card-slot-swapped',
                penaltySet.has(slot.position)  && 'card-slot-penalty',
              ].filter(Boolean).join(' ')}
              onClick={canClick ? () => onSlotClick(slot.position) : undefined}
              title={canClick ? 'Play this card down' : undefined}
            >
              {slot.hasCard ? (
                <Card card={slot.card} faceDown={!slot.card} small={small} />
              ) : (
                <div className={['empty-slot', small && 'empty-slot-small'].filter(Boolean).join(' ')} />
              )}
              {peekedSet.has(slot.position) && (
                <span className="card-peek-eye">👁</span>
              )}
            </div>
          );
        })}
      </div>

      {selectable && hint && <div className="grid-select-hint">{hint}</div>}
    </div>
  );
}
