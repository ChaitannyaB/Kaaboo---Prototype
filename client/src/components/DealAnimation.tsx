import { useEffect, useMemo, useState, type CSSProperties } from 'react';

interface Pos { tx: string; ty: string; }

const OPPONENT_POSITIONS: Record<number, Pos[]> = {
  1: [{ tx: '0vw',    ty: '-24vh' }],
  2: [{ tx: '-20vw',  ty: '-22vh' }, { tx: '20vw',   ty: '-22vh' }],
  3: [{ tx: '-26vw',  ty: '-20vh' }, { tx: '0vw',    ty: '-26vh' }, { tx: '26vw',   ty: '-20vh' }],
  4: [{ tx: '-28vw',  ty: '-18vh' }, { tx: '-10vw',  ty: '-26vh' }, { tx: '10vw',   ty: '-26vh' }, { tx: '28vw',   ty: '-18vh' }],
  5: [{ tx: '-28vw',  ty: '-16vh' }, { tx: '-16vw',  ty: '-24vh' }, { tx: '0vw',    ty: '-28vh' }, { tx: '16vw',   ty: '-24vh' }, { tx: '28vw',   ty: '-16vh' }],
};
const MY_POS: Pos = { tx: '0vw', ty: '22vh' };
const CARDS_EACH  = 4;
const INTERVAL_MS = 55;
const FLY_MS      = 320;

interface DealAnimationProps {
  playerCount: number;
  onDone: () => void;
}

export function DealAnimation({ playerCount, onDone }: DealAnimationProps) {
  const [out, setOut] = useState(false);
  const oppCount = Math.max(1, Math.min(5, playerCount - 1));
  const oppPos = OPPONENT_POSITIONS[oppCount] ?? OPPONENT_POSITIONS[1]!;

  const cards = useMemo(() => {
    const list: { key: string; pos: Pos; delay: number }[] = [];
    for (let round = 0; round < CARDS_EACH; round++) {
      oppPos.forEach((pos, i) => {
        list.push({ key: `o${i}-${round}`, pos, delay: (round * playerCount + i) * INTERVAL_MS });
      });
      list.push({ key: `me-${round}`, pos: MY_POS, delay: (round * playerCount + oppPos.length) * INTERVAL_MS });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerCount]);

  const lastDelay = cards.at(-1)?.delay ?? 0;
  const holdMs    = lastDelay + FLY_MS + 80;

  useEffect(() => {
    const t1 = window.setTimeout(() => setOut(true), holdMs);
    const t2 = window.setTimeout(onDone, holdMs + 220);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [holdMs, onDone]);

  return (
    <div className={`deal-overlay${out ? ' deal-overlay-out' : ''}`}>
      <div className="deal-deck">
        <div className="deal-deck-card" style={{ transform: 'rotate(4deg) translate(3px,-4px)' }} />
        <div className="deal-deck-card" style={{ transform: 'rotate(-3deg) translate(-2px,-2px)' }} />
        <div className="deal-deck-card" />
      </div>

      {cards.map((c) => (
        <div
          key={c.key}
          className="deal-card"
          style={{
            ['--deal-tx' as string]: c.pos.tx,
            ['--deal-ty' as string]: c.pos.ty,
            animationDelay: `${c.delay}ms`,
            animationDuration: `${FLY_MS}ms`,
          } as CSSProperties}
        />
      ))}

      <span className="deal-label">Dealing cards…</span>
    </div>
  );
}

