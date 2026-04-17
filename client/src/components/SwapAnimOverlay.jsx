import { useState, useEffect } from 'react';
import Card from './Card';

// Renders two card ghosts flying between the two swapped slots.
// first / second: { rect: DOMRect, card: Card | null }
export default function SwapAnimOverlay({ first, second }) {
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    // Two animation frames ensure the initial (non-transitioning) paint is
    // committed before we flip the transition on.
    let r1, r2;
    r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setFlying(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);

  const dx = second.rect.left - first.rect.left;
  const dy = second.rect.top  - first.rect.top;

  function ghostStyle(isFirst) {
    const vvTop  = window.visualViewport?.offsetTop  ?? 0;
    const vvLeft = window.visualViewport?.offsetLeft ?? 0;
    return {
      position: 'fixed',
      left: (isFirst ? first.rect.left : second.rect.left) - vvLeft,
      top:  (isFirst ? first.rect.top  : second.rect.top)  - vvTop,
      width:  first.rect.width  || 72,
      height: first.rect.height || 100,
      pointerEvents: 'none',
      zIndex: 500,
      transition: flying ? 'transform 0.8s cubic-bezier(0.4,0,0.2,1), opacity 0.8s ease' : 'none',
      transform: flying
        ? `translate(${isFirst ? dx : -dx}px, ${isFirst ? dy : -dy}px)`
        : 'translate(0,0)',
    };
  }

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 499 }}>
      <div style={ghostStyle(true)}>
        <Card card={first.card}  faceDown={!first.card} />
      </div>
      <div style={ghostStyle(false)}>
        <Card card={second.card} faceDown={!second.card} />
      </div>
    </div>
  );
}
