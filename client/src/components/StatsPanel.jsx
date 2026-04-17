import { useState, useEffect } from 'react';
import { api } from '../api';

function StatRow({ label, value, sub, highlight }) {
  return (
    <div className={`stat-row${highlight ? ' stat-row-highlight' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value ?? <span className="stat-na">—</span>}
        {sub && <span className="stat-sub">{sub}</span>}
      </span>
    </div>
  );
}

function pct(v) {
  return v != null ? `${v}%` : null;
}

export default function StatsPanel({ userId, inline }) {
  const [stats, setStats] = useState(null);
  const [username, setUsername] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const fetch = userId
      ? api.getUserStats(userId)
      : api.getMyStats();

    fetch
      .then((data) => {
        setStats(data.stats);
        if (data.username) setUsername(data.username);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <div className={`stats-panel${inline ? ' stats-inline' : ''}`}><p className="stat-loading">Loading stats…</p></div>;
  if (error)   return <div className={`stats-panel${inline ? ' stats-inline' : ''}`}><p className="stat-error">{error}</p></div>;
  if (!stats)  return null;

  const sbCls = stats.scoreboard > 0 ? 'pos' : stats.scoreboard < 0 ? 'neg' : '';
  const sbLabel = stats.scoreboard > 0 ? `+${stats.scoreboard}` : String(stats.scoreboard);

  return (
    <div className={`stats-panel${inline ? ' stats-inline' : ''}`}>
      {username && <div className="stats-panel-title">{username}'s Stats</div>}
      {!username && !inline && <div className="stats-panel-title">Your Stats</div>}

      {/* Scoreboard hero */}
      <div className="stats-hero">
        <div className={`stats-hero-value ${sbCls}`}>{sbLabel}</div>
        <div className="stats-hero-label">Scoreboard</div>
      </div>

      <div className="stat-grid">
        <div className="stat-group">
          <div className="stat-group-title">Overall</div>
          <StatRow label="Rounds played"  value={stats.roundsPlayed} />
          <StatRow label="Kaaboo calls"   value={stats.kaabooCalls} />
          <StatRow label="Kaaboo wins"    value={stats.kaabooWins}
                   sub={pct(stats.winRate) ? ` (${pct(stats.winRate)})` : ''} highlight />
          <StatRow label="Kaaboo losses"  value={stats.kaabooLosses} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">Scores</div>
          <StatRow label="Avg card score" value={stats.avgCardScore ?? '—'} />
          <StatRow label="Best score"     value={stats.bestCardScore ?? '—'} highlight />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">Play-downs</div>
          <StatRow label="Attempted"   value={stats.playdownsAttempted} />
          <StatRow label="Succeeded"   value={stats.playdownsSucceeded}
                   sub={pct(stats.playdownAccuracy) ? ` (${pct(stats.playdownAccuracy)})` : ''} highlight />
          <StatRow label="Penalties"   value={stats.penaltiesReceived} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">Powers</div>
          <StatRow label="Used"    value={stats.powersUsed} highlight />
          <StatRow label="Skipped" value={stats.powersSkipped} />
        </div>
      </div>
    </div>
  );
}
