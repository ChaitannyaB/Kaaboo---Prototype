import { useEffect, useRef } from 'react';
import { App } from 'antd';
import type { PlayerPublic } from '@/types/game';

interface PlayerToastsProps { players: PlayerPublic[] | undefined; }

export function PlayerToasts({ players }: PlayerToastsProps) {
  const { notification } = App.useApp();
  const prevIds = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (!players) return;
    const current = new Map(players.map((p) => [p.id, p.name]));

    if (prevIds.current === null) {
      prevIds.current = current;
      return;
    }

    const prev = prevIds.current;
    for (const [id, name] of current) {
      if (!prev.has(id)) {
        notification.open({
          message: `${name} joined`,
          placement: 'topRight',
          duration: 3,
        });
      }
    }
    for (const [id, name] of prev) {
      if (!current.has(id)) {
        notification.open({
          message: `${name} left`,
          placement: 'topRight',
          duration: 3,
        });
      }
    }
    prevIds.current = current;
  }, [players, notification]);

  return null;
}

