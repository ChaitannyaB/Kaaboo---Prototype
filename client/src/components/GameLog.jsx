import { useState, useEffect, useRef } from 'react';

const TYPE_ICON = {
  round:           '🎮',
  info:            '•',
  turn:            '▶',
  kaaboo:          '★',
  action:          '🃏',
  playdown:        '⚡',
  'playdown-win':  '✅',
  power:           '⚡',
  'power-used':    '✨',
  'power-skip':    '⏭',
  peek:            '👁',
  swap:            '🔀',
  give:            '🤲',
  penalty:         '⚠️',
  win:             '🏆',
  loss:            '💔',
};

export default function GameLog({ logs }) {
  const [open, setOpen] = useState(true);
  const listRef = useRef(null);
  const prevLenRef = useRef(0);
  const [unread, setUnread] = useState(0);

  // Track unread when collapsed; scroll to bottom when open
  useEffect(() => {
    if (logs.length === prevLenRef.current) return;
    const newCount = logs.length - prevLenRef.current;
    prevLenRef.current = logs.length;
    if (!open) {
      setUnread(u => u + newCount);
    } else {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [logs.length, open]);

  // Clear unread when opened; scroll to bottom
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'instant' });
      }, 0);
    }
  }, [open]);

  return (
    <div className={`game-log-panel${open ? ' game-log-open' : ''}`}>
      <button className="game-log-toggle" onClick={() => setOpen(o => !o)}>
        <span className="game-log-chevron">{open ? '▾' : '▸'}</span>
        <span className="game-log-title">Game Log</span>
        {!open && unread > 0 && (
          <span className="game-log-badge">{unread > 99 ? '99+' : unread}</span>
        )}
        {open && <span className="game-log-count">{logs.length}</span>}
      </button>

      {open && (
        <div className="game-log-list" ref={listRef}>
          {logs.length === 0 ? (
            <div className="game-log-empty">No events yet…</div>
          ) : (
            logs.map(log => (
              <div key={log.id} className={`game-log-entry game-log-${log.type}`}>
                <span className="game-log-icon">{TYPE_ICON[log.type] ?? '•'}</span>
                <span className="game-log-text">{log.text}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
