import clsx from 'clsx';
import type { Card as CardType, Suit } from '@/types/game';

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
  joker: '★',
};

const RED_SUITS = new Set<Suit>(['hearts', 'diamonds']);

interface CardProps {
  card?: CardType | null;
  faceDown?: boolean;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  dim?: boolean;
}

export function Card({ card, faceDown, selected, onClick, small, dim }: CardProps) {
  if (faceDown || !card) {
    return (
      <div
        className={clsx('card', 'card-back', small && 'card-small', onClick && 'card-clickable', dim && 'card-dim')}
        onClick={onClick}
      >
        <div className="card-back-pattern" />
      </div>
    );
  }

  const isJoker = card.suit === 'joker';
  const isRed = RED_SUITS.has(card.suit) || isJoker;

  return (
    <div
      className={clsx(
        'card',
        isRed ? 'card-red' : 'card-black',
        isJoker && 'card-joker',
        selected && 'card-selected',
        small && 'card-small',
        onClick && 'card-clickable',
        dim && 'card-dim',
      )}
      onClick={onClick}
    >
      {isJoker ? (
        <div className="card-joker-body">
          <span className="card-joker-star">★</span>
          <span className="card-joker-label">JOKER</span>
        </div>
      ) : (
        <>
          <div className="card-corner card-top-left">
            <span className="card-rank">{card.rank}</span>
            <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
          </div>
          <div className="card-center-suit">{SUIT_SYMBOLS[card.suit]}</div>
          <div className="card-corner card-bottom-right">
            <span className="card-rank">{card.rank}</span>
            <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
          </div>
        </>
      )}
    </div>
  );
}

