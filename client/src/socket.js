import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const socket = io(SERVER_URL, {
  autoConnect: false,
  auth: (cb) => cb({ token: localStorage.getItem('kaaboo_token') || '' }),
});

export default socket;
