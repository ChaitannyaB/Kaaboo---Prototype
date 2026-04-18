import clsx from 'clsx';
import { Alert, Spin } from 'antd';
import { useMyStats, useUserStats } from '@/api/queries/stats';

function StatRow({ label, value, sub, highlight }: { label: string; value: string | number; sub?: string; highlight?: boolean }) {
  return (
    <div className={clsx('stat-row', highlight && 'stat-row-highlight')}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {sub && <span className="stat-sub">{sub}</span>}
      </span>
    </div>
  );
}

function pct(v: number | null | undefined): string | null {
  return v != null ? `${v}%` : null;
}

interface StatsPanelProps { userId?: string; inline?: boolean; }

export function StatsPanel({ userId, inline }: StatsPanelProps) {
  const myQ = useMyStats();
  const otherQ = useUserStats(userId);
  const q = userId ? otherQ : myQ;

  const wrapCls = clsx('stats-panel', inline && 'stats-inline');

  if (q.isLoading) return <div className={wrapCls}><Spin size="small" /> <span className="stat-loading">Loading stats…</span></div>;
  if (q.isError)   return <div className={wrapCls}><Alert type="error" showIcon message={(q.error as Error).message} /></div>;
  if (!q.data)     return null;

  const { stats, username } = q.data;
  const sbCls = stats.scoreboard > 0 ? 'pos' : stats.scoreboard < 0 ? 'neg' : '';
  const sbLabel = stats.scoreboard > 0 ? `+${stats.scoreboard}` : String(stats.scoreboard);

  return (
    <div className={wrapCls}>
      {username && <div className="stats-panel-title">{username}'s Stats</div>}
      {!username && !inline && <div className="stats-panel-title">Your Stats</div>}

      <div className="stats-hero">
        <div className={`stats-hero-value ${sbCls}`}>{sbLabel}</div>
        <div className="stats-hero-label">Scoreboard</div>
      </div>

      <div className="stat-grid">
        <div className="stat-group">
          <div className="stat-group-title">Overall</div>
          <StatRow label="Rounds played" value={stats.roundsPlayed} />
          <StatRow label="Kaaboo calls"  value={stats.kaabooCalls} />
          <StatRow label="Kaaboo wins"   value={stats.kaabooWins}
                   sub={pct(stats.winRate) ? ` (${pct(stats.winRate)})` : undefined} highlight />
          <StatRow label="Kaaboo losses" value={stats.kaabooLosses} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">Scores</div>
          <StatRow label="Avg card score" value={stats.avgCardScore ?? '—'} />
          <StatRow label="Best score"     value={stats.bestCardScore ?? '—'} highlight />
        </div>

        {stats.playdownsAttempted != null && (
          <div className="stat-group">
            <div className="stat-group-title">Play-downs</div>
            <StatRow label="Attempted" value={stats.playdownsAttempted} />
            <StatRow label="Succeeded" value={stats.playdownsSucceeded ?? 0}
                     sub={pct(stats.playdownAccuracy) ? ` (${pct(stats.playdownAccuracy)})` : undefined} highlight />
            <StatRow label="Penalties" value={stats.penaltiesReceived ?? 0} />
          </div>
        )}

        {stats.powersUsed != null && (
          <div className="stat-group">
            <div className="stat-group-title">Powers</div>
            <StatRow label="Used"    value={stats.powersUsed} highlight />
            <StatRow label="Skipped" value={stats.powersSkipped ?? 0} />
          </div>
        )}
      </div>
    </div>
  );
}

