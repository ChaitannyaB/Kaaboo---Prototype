import type { GameState, GridPosition } from './game';

export interface ServerToClientEvents {
  'me': (payload: { userId: string; username: string }) => void;
  'game-state': (state: GameState) => void;
  'stats-ready': () => void;
  'chat-message': (msg: { from: string; text: string; ts: number }) => void;
  'friend-request': (data: { id: string; from: { id: string; username: string } }) => void;
  'friend-accepted': () => void;
  'game-invite': (data: { id: string; roomId: string; inviter: { id: string; username: string } }) => void;
  'friend-online': (data: { userId: string }) => void;
  'friend-offline': (data: { userId: string }) => void;
  'room-reset': (data: { reason: string }) => void;
}

export type SocketCallback<T = unknown> = (res: T) => void;

export interface ServerAck {
  ok?: boolean;
  error?: string;
  roomId?: string;
  [key: string]: unknown;
}

export interface ClientToServerEvents {
  'create-room': (data: { isPublic?: boolean }, cb?: SocketCallback<ServerAck>) => void;
  'join-room': (data: { roomId: string }, cb?: SocketCallback<ServerAck>) => void;
  'leave-room': (cb?: SocketCallback<ServerAck>) => void;
  'set-room-visibility': (data: { isPublic: boolean }, cb?: SocketCallback<ServerAck>) => void;
  'start-game': (cb?: SocketCallback<ServerAck>) => void;
  'draw-card': (cb?: SocketCallback<ServerAck>) => void;
  'discard-drawn-card': (cb?: SocketCallback<ServerAck>) => void;
  'replace-grid-card': (data: { gridPosition: GridPosition }, cb?: SocketCallback<ServerAck>) => void;
  'play-down': (
    data: { cardOwnerId: string; gridPosition: GridPosition },
    cb?: SocketCallback<ServerAck & { penalty?: boolean; giveCard?: boolean }>,
  ) => void;
  'give-card': (data: { gridPosition: GridPosition }, cb?: SocketCallback<ServerAck>) => void;
  'call-kaaboo': (cb?: SocketCallback<ServerAck>) => void;
  'power-decision': (data: { use: boolean }, cb?: SocketCallback<ServerAck>) => void;
  'power-skip': (cb?: SocketCallback<ServerAck>) => void;
  'power-peek': (
    data: { targetPlayerId: string; gridPosition: GridPosition },
    cb?: SocketCallback<ServerAck & { complete?: boolean }>,
  ) => void;
  'power-swap-select': (
    data: { targetPlayerId: string; gridPosition: GridPosition },
    cb?: SocketCallback<ServerAck & { step?: number; complete?: boolean }>,
  ) => void;
  'power-swap-preview': (data: { selections: { playerId: string; gridPosition: GridPosition }[] }) => void;
  'power-swap-confirm': (
    data: { card1: { ownerId: string; gridPosition: GridPosition }; card2: { ownerId: string; gridPosition: GridPosition } },
    cb?: SocketCallback<ServerAck>,
  ) => void;
  'chat-message': (data: { text: string }, cb?: SocketCallback<ServerAck>) => void;
}
