import { useState } from 'react';
import clsx from 'clsx';
import type { PlayerPublic } from '@/types/game';

interface Props {
  players: PlayerPublic[];
  myId: string;
  kaabooCallerId: string | null;
  hidden?: boolean;
}

export function ScoreBoardLeaderboard({ players, myId, kaabooCallerId, hidden }: Props) {
  const [open, setOpen] = useState(false);
  const me = players.find((p) => p.id === myId);
  const myValue = me?.sessionScoreBoard ?? 0;
  const sorted = [...players].sort((a, b) => (b.sessionScoreBoard ?? 0) - (a.sessionScoreBoard ?? 0));

  if (hidden) return null;

  const sbClass = (v: number) => (v > 0 ? 'sb-pip-pos' : v < 0 ? 'sb-pip-neg' : 'sb-pip-neutral');
  const sbLabel = (v: number) => (v > 0 ? `+${v}` : String(v));

  return (
    <div className={clsx('sb-leaderboard', open && 'sb-leaderboard-open')}>
      <button
        className={clsx('sb-leaderboard-chip', sbClass(myValue))}
        onClick={() => setOpen((v) => !v)}
        title="Scoreboard"
        aria-expanded={open}
      >
        <span className="sb-leaderboard-trophy">🏆</span>
        <span className="sb-leaderboard-chip-value">SB {sbLabel(myValue)}</span>
        <span className="sb-leaderboard-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="sb-leaderboard-panel" role="list">
          <div className="sb-leaderboard-title">Scoreboard</div>
          {sorted.map((p) => {
            const v = p.sessionScoreBoard ?? 0;
            return (
              <div key={p.id} className="sb-leaderboard-row" role="listitem">
                <span className="sb-leaderboard-name">
                  {p.id === kaabooCallerId && <span className="sb-leaderboard-mark">★</span>}
                  {p.isHost && <span className="sb-leaderboard-mark">👑</span>}
                  <span className={clsx(p.id === myId && 'sb-leaderboard-me')}>{p.name}</span>
                </span>
                <span className={clsx('sb-pip', sbClass(v))}>SB {sbLabel(v)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
