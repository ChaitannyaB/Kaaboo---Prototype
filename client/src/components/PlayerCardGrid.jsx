import Card from './Card';

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
  highlightedSlot, peekedSlots = [], swappedSlots = [],
}) {
  const peekedSet  = new Set(peekedSlots);
  const swappedSet = new Set(swappedSlots);

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
              className={[
                'card-slot-wrap',
                canClick && 'card-slot-target',
                slot.position === highlightedSlot && 'card-slot-highlighted',
                peekedSet.has(slot.position)  && 'card-slot-peeked',
                swappedSet.has(slot.position) && 'card-slot-swapped',
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
