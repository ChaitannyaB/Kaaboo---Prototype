import { useEffect, useState, useMemo } from 'react';

// Destination offsets per opponent count — vw/vh so it scales on any screen
const OPPONENT_POSITIONS = {
  1: [{ tx: '0vw',    ty: '-24vh' }],
  2: [{ tx: '-20vw',  ty: '-22vh' }, { tx: '20vw',   ty: '-22vh' }],
  3: [{ tx: '-26vw',  ty: '-20vh' }, { tx: '0vw',    ty: '-26vh' }, { tx: '26vw',   ty: '-20vh' }],
  4: [{ tx: '-28vw',  ty: '-18vh' }, { tx: '-10vw',  ty: '-26vh' }, { tx: '10vw',   ty: '-26vh' }, { tx: '28vw',   ty: '-18vh' }],
  5: [{ tx: '-28vw',  ty: '-16vh' }, { tx: '-16vw',  ty: '-24vh' }, { tx: '0vw',    ty: '-28vh' }, { tx: '16vw',   ty: '-24vh' }, { tx: '28vw',   ty: '-16vh' }],
};
const MY_POS       = { tx: '0vw', ty: '22vh' };
const CARDS_EACH   = 4;
const INTERVAL_MS  = 55;  // ms between each dealt card
const FLY_MS       = 320; // flight duration

export default function DealAnimation({ playerCount, onDone }) {
  const [out, setOut] = useState(false);

  const oppCount   = Math.max(1, Math.min(5, playerCount - 1));
  const oppPos     = OPPONENT_POSITIONS[oppCount] ?? OPPONENT_POSITIONS[1];

  // Build card list — round-robin: opponents then me, repeated CARDS_EACH times
  const cards = useMemo(() => {
    const list = [];
    for (let round = 0; round < CARDS_EACH; round++) {
      oppPos.forEach((pos, i) => {
        list.push({ key: `o${i}-${round}`, pos, delay: (round * playerCount + i) * INTERVAL_MS });
      });
      list.push({ key: `me-${round}`, pos: MY_POS, delay: (round * playerCount + oppPos.length) * INTERVAL_MS });
    }
    return list;
  }, [playerCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastDelay = cards.at(-1)?.delay ?? 0;
  const holdMs    = lastDelay + FLY_MS + 80; // wait until last card lands + brief pause

  useEffect(() => {
    const t1 = setTimeout(() => setOut(true),  holdMs);
    const t2 = setTimeout(onDone,              holdMs + 220);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [holdMs, onDone]);

  return (
    <div className={`deal-overlay${out ? ' deal-overlay-out' : ''}`}>
      {/* Static deck stack in centre */}
      <div className="deal-deck">
        <div className="deal-deck-card" style={{ transform: 'rotate(4deg) translate(3px,-4px)' }} />
        <div className="deal-deck-card" style={{ transform: 'rotate(-3deg) translate(-2px,-2px)' }} />
        <div className="deal-deck-card" />
      </div>

      {/* Cards flying to each player */}
      {cards.map(c => (
        <div
          key={c.key}
          className="deal-card"
          style={{
            '--deal-tx': c.pos.tx,
            '--deal-ty': c.pos.ty,
            animationDelay:    `${c.delay}ms`,
            animationDuration: `${FLY_MS}ms`,
          }}
        />
      ))}

      <span className="deal-label">Dealing cards…</span>
    </div>
  );
}
