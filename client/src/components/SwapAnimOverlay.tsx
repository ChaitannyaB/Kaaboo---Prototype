import { useEffect, useState, type CSSProperties } from 'react';
import { Card } from './Card';
import type { Card as CardType } from '@/types/game';

export interface SwapSlot {
  rect: { top: number; left: number; width: number; height: number };
  card: CardType | null;
}

interface SwapAnimOverlayProps {
  first: SwapSlot;
  second: SwapSlot;
}

export function SwapAnimOverlay({ first, second }: SwapAnimOverlayProps) {
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    let r1 = 0;
    let r2 = 0;
    r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setFlying(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);

  const dx = second.rect.left - first.rect.left;
  const dy = second.rect.top  - first.rect.top;

  function ghostStyle(isFirst: boolean): CSSProperties {
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

