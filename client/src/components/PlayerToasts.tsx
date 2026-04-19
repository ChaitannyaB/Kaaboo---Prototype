import { useEffect, useRef, useState } from 'react';
import type { PlayerPublic } from '@/types/game';

interface PlayerToastsProps { players: PlayerPublic[] | undefined; }

interface Toast { id: number; name: string; type: 'joined' | 'left'; }

let _nextId = 0;

export function PlayerToasts({ players }: PlayerToastsProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prevIdsRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (!players) return;
    const currentMap = new Map(players.map((p) => [p.id, p.name]));

    if (prevIdsRef.current === null) {
      prevIdsRef.current = currentMap;
      return;
    }

    const prev = prevIdsRef.current;
    const added: string[] = [];
    const removed: string[] = [];

    for (const [id, name] of currentMap) {
      if (!prev.has(id)) added.push(name);
    }
    for (const [id, name] of prev) {
      if (!currentMap.has(id)) removed.push(name);
    }

    prevIdsRef.current = currentMap;

    const newToasts: Toast[] = [
      ...added.map((name) => ({ id: _nextId++, name, type: 'joined' as const })),
      ...removed.map((name) => ({ id: _nextId++, name, type: 'left' as const })),
    ];

    if (newToasts.length === 0) return;

    setToasts((prev) => [...prev, ...newToasts]);

    newToasts.forEach((t) => {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 3000);
    });
  }, [players]);

  if (toasts.length === 0) return null;

  return (
    <div className="player-toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`player-toast player-toast-${t.type}`}>
          <span className="player-toast-dot" />
          <span className="player-toast-text">
            <strong>{t.name}</strong> {t.type === 'joined' ? 'joined' : 'left'}
          </span>
          <button
            className="player-toast-close"
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
