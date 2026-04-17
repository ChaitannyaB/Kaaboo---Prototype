import { useState, useEffect, useRef } from 'react';

let _nextId = 0;

export default function PlayerToasts({ players }) {
  const [toasts, setToasts] = useState([]);
  const prevIdsRef = useRef(null); // null = first render, skip comparison

  useEffect(() => {
    if (!players) return;
    const currentMap = new Map(players.map((p) => [p.id, p.name]));

    if (prevIdsRef.current === null) {
      // First time we see players — record without showing toasts
      prevIdsRef.current = currentMap;
      return;
    }

    const prev = prevIdsRef.current;
    const added   = [];
    const removed = [];

    for (const [id, name] of currentMap) {
      if (!prev.has(id)) added.push(name);
    }
    for (const [id, name] of prev) {
      if (!currentMap.has(id)) removed.push(name);
    }

    prevIdsRef.current = currentMap;

    const newToasts = [
      ...added.map((name)   => ({ id: _nextId++, name, type: 'joined' })),
      ...removed.map((name) => ({ id: _nextId++, name, type: 'left'   })),
    ];

    if (newToasts.length === 0) return;

    setToasts((prev) => [...prev, ...newToasts]);

    // Auto-dismiss each after 3 s
    newToasts.forEach((t) => {
      setTimeout(() => {
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
          <button className="player-toast-close" onClick={() =>
            setToasts((prev) => prev.filter((x) => x.id !== t.id))
          }>×</button>
        </div>
      ))}
    </div>
  );
}
