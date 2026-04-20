import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@/types/socket';
import { TOKEN_KEY } from '@/api/client';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? `http://localhost:8888`;

function createSocket(): AppSocket {
  return io(SERVER_URL, {
    autoConnect: false,
    auth: (cb) => cb({ token: localStorage.getItem(TOKEN_KEY) ?? '' }),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}

interface SocketState {
  socket: AppSocket;
  myId: string | null;
  connected: boolean;
  setMyId: (id: string | null) => void;
  setConnected: (v: boolean) => void;
  connect: () => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: createSocket(),
  myId: null,
  connected: false,
  setMyId: (id) => set({ myId: id }),
  setConnected: (v) => set({ connected: v }),
  connect: () => {
    const s = get().socket;
    if (!s.connected) s.connect();
  },
  disconnect: () => {
    const s = get().socket;
    if (s.connected) s.disconnect();
    set({ myId: null, connected: false });
  },
}));

export function getSocket(): AppSocket {
  return useSocketStore.getState().socket;
}
