import { useState, useEffect } from 'react';
import Card from './Card';

// Animates a single card flying from `from.rect` to `to.rect`.
// from: { rect: DOMRect, card: Card | null }
// to:   { rect: DOMRect }
export default function GiveCardAnim({ from, to }) {
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    let r1, r2;
    r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setFlying(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);

  const dx = to.rect.left - from.rect.left;
  const dy = to.rect.top  - from.rect.top;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 499 }}>
      <div style={{
        position: 'fixed',
        left:   from.rect.left,
        top:    from.rect.top,
        width:  from.rect.width  || 72,
        height: from.rect.height || 100,
        pointerEvents: 'none',
        transition: flying
          ? 'transform 0.75s cubic-bezier(0.4,0,0.2,1), opacity 0.75s ease'
          : 'none',
        transform: flying ? `translate(${dx}px, ${dy}px)` : 'translate(0,0)',
      }}>
        <Card card={from.card} faceDown={!from.card} />
      </div>
    </div>
  );
}
