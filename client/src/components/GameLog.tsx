import { useEffect, useRef, useState } from 'react';
import { Badge } from 'antd';

export interface GameLogEntry {
  id: string | number;
  type: string;
  text: string;
}

const TYPE_ICON: Record<string, string> = {
  round: '🎮', info: '•', turn: '▶', kaaboo: '★', action: '🃏',
  playdown: '⚡', 'playdown-win': '✅', power: '⚡', 'power-used': '✨',
  'power-skip': '⏭', peek: '👁', swap: '🔀', give: '🤲', penalty: '⚠️',
  win: '🏆', loss: '💔',
};

interface GameLogProps { logs: GameLogEntry[]; }

export function GameLog({ logs }: GameLogProps) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const prevLen = useRef(0);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (logs.length === prevLen.current) return;
    const newCount = logs.length - prevLen.current;
    prevLen.current = logs.length;
    if (!open) {
      setUnread((u) => u + newCount);
    } else {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [logs.length, open]);

  useEffect(() => {
    if (!open) return;
    setUnread(0);
    window.setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, 0);
  }, [open]);

  return (
    <div className={`game-log-panel${open ? ' game-log-open' : ''}`}>
      <button className="game-log-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="game-log-chevron">{open ? '▾' : '▸'}</span>
        <span className="game-log-title">Log</span>
        {!open && unread > 0 && (
          <Badge count={unread} overflowCount={99} size="small" style={{ marginLeft: 6 }} />
        )}
        {open && <span className="game-log-count">{logs.length}</span>}
      </button>

      {open && (
        <div className="game-log-list" ref={listRef}>
          {logs.length === 0 ? (
            <div className="game-log-empty">No events yet…</div>
          ) : (
            logs.map((log) => (
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

