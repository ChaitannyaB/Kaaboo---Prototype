import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSocketStore } from '@/stores/socketStore';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';
import { useUiStore } from '@/stores/uiStore';
import { friendsKeys } from '@/api/queries/friends';
import { inviteKeys } from '@/api/queries/invites';
import type { Friend } from '@/types/api';

export function useSocketLifecycle() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const socket = useSocketStore((s) => s.socket);
  const setMyId = useSocketStore((s) => s.setMyId);
  const setConnected = useSocketStore((s) => s.setConnected);
  const setGameState = useGameStore((s) => s.setGameState);
  const resetGame = useGameStore((s) => s.reset);

  useEffect(() => {
    if (!token) {
      if (socket.connected) socket.disconnect();
      resetGame();
      return;
    }
    if (!socket.connected) socket.connect();

    const onConnect = () => {
      setConnected(true);
      setMyId(socket.id ?? null);
    };
    const onMe = (payload: { userId: string; username: string }) => {
      // Hook for future: socket confirms auth; noop for now.
      void payload;
    };
    const onDisconnect = (reason: string) => {
      setConnected(false);
      // eslint-disable-next-line no-console
      console.warn('[socket] disconnect:', reason);
    };
    const onConnectError = (err: Error) => {
      // eslint-disable-next-line no-console
      console.warn('[socket] connect_error:', err.message);
    };
    const onGameState = (state: Parameters<Parameters<typeof socket.on<'game-state'>>[1]>[0]) => {
      setGameState(state);
      if (state.phase === 'lobby') {
        navigate(`/lobby/room/${state.roomId}`, { replace: false });
      } else if (
        state.phase === 'dealing' ||
        state.phase === 'peek' ||
        state.phase === 'playing' ||
        state.phase === 'finished'
      ) {
        navigate(`/game/${state.roomId}`, { replace: false });
      }
    };

    const onFriendRequest = () => {
      qc.invalidateQueries({ queryKey: friendsKeys.requests });
    };
    const onFriendAccepted = () => {
      qc.invalidateQueries({ queryKey: friendsKeys.friends });
      qc.invalidateQueries({ queryKey: friendsKeys.requests });
    };
    const onGameInvite = () => {
      qc.invalidateQueries({ queryKey: inviteKeys.all });
    };
    const onFriendOnline = ({ userId }: { userId: string }) => {
      qc.setQueryData<Friend[]>(friendsKeys.friends, (prev) =>
        prev ? prev.map((f) => (f.id === userId ? { ...f, online: true } : f)) : prev,
      );
    };
    const onFriendOffline = ({ userId }: { userId: string }) => {
      qc.setQueryData<Friend[]>(friendsKeys.friends, (prev) =>
        prev ? prev.map((f) => (f.id === userId ? { ...f, online: false } : f)) : prev,
      );
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('error', onConnectError);
    socket.on('me', onMe);
    socket.on('game-state', onGameState);
    socket.on('friend-request', onFriendRequest);
    socket.on('friend-accepted', onFriendAccepted);
    socket.on('game-invite', onGameInvite);
    socket.on('friend-online', onFriendOnline);
    socket.on('friend-offline', onFriendOffline);

    const onRoomReset = ({ reason }: { reason: string }) => {
      const msg = reason === 'not-enough-players'
        ? 'Game cancelled — not enough players. Back to lobby.'
        : 'Game cancelled — back to lobby.';
      useUiStore.getState().showFlash(msg);
    };
    socket.on('room-reset', onRoomReset);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('error', onConnectError);
      socket.off('me', onMe);
      socket.off('game-state', onGameState);
      socket.off('friend-request', onFriendRequest);
      socket.off('friend-accepted', onFriendAccepted);
      socket.off('game-invite', onGameInvite);
      socket.off('friend-online', onFriendOnline);
      socket.off('friend-offline', onFriendOffline);
      socket.off('room-reset', onRoomReset);
    };
  }, [token, socket, qc, navigate, setConnected, setMyId, setGameState, resetGame]);
}
