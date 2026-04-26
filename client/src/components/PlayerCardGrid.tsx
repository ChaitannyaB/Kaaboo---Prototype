import clsx from 'clsx';
import { Card } from './Card';
import type { GridPosition, GridSlotPrivate } from '@/types/game';

function getSlotPlacement(position: string): { gridColumn: number; gridRow: number } {
  switch (position) {
    case 'top-left':     return { gridColumn: 1, gridRow: 1 };
    case 'top-right':    return { gridColumn: 2, gridRow: 1 };
    case 'bottom-left':  return { gridColumn: 1, gridRow: 2 };
    case 'bottom-right': return { gridColumn: 2, gridRow: 2 };
    default: {
      const idx = parseInt(position.replace('extra-', ''), 10) || 0;
      return { gridColumn: 3 + Math.floor(idx / 2), gridRow: 1 + (idx % 2) };
    }
  }
}

interface PlayerCardGridProps {
  grid: GridSlotPrivate[];
  small?: boolean;
  label?: string;
  isActive?: boolean;
  selectable?: boolean;
  onSlotClick?: (position: string) => void;
  hint?: string;
  highlightedSlots?: string[];
  peekedSlots?: string[];
  swappedSlots?: string[];
  penaltySlots?: string[];
  replacedSlots?: string[];
  playerId?: string;
}

export function PlayerCardGrid({
  grid, small, label, isActive, selectable, onSlotClick, hint,
  highlightedSlots = [], peekedSlots = [], swappedSlots = [], penaltySlots = [], replacedSlots = [], playerId,
}: PlayerCardGridProps) {
  const highlightedSet = new Set(highlightedSlots);
  const peekedSet   = new Set(peekedSlots);
  const swappedSet  = new Set(swappedSlots);
  const penaltySet  = new Set(penaltySlots);
  const replacedSet = new Set(replacedSlots);

  return (
    <div className={clsx(
      'player-grid-wrap',
      isActive && 'player-grid-active',
      selectable && 'player-grid-selectable',
    )}>
      {label && <div className="player-grid-label">{label}</div>}

      <div className={clsx('card-grid', small && 'card-grid-small')}>
        {grid.map((slot) => {
          const canClick = Boolean(selectable && slot.hasCard && onSlotClick);
          return (
            <div
              key={slot.position}
              data-player={playerId}
              data-slot={slot.position}
              style={getSlotPlacement(slot.position)}
              className={clsx(
                'card-slot-wrap',
                canClick && 'card-slot-target',
                highlightedSet.has(slot.position) && 'card-slot-highlighted',
                peekedSet.has(slot.position)   && 'card-slot-peeked',
                swappedSet.has(slot.position)  && 'card-slot-swapped',
                penaltySet.has(slot.position)  && 'card-slot-penalty',
                replacedSet.has(slot.position) && 'card-slot-replaced',
              )}
              onClick={canClick ? () => onSlotClick?.(slot.position) : undefined}
              title={canClick ? 'Play this card down' : undefined}
            >
              {slot.hasCard ? (
                <Card card={slot.card} faceDown={!slot.card} small={small} />
              ) : (
                <div className={clsx('empty-slot', small && 'empty-slot-small')} />
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

export type { GridPosition };
