import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { useSocketLifecycle } from '@/hooks/useSocketLifecycle';
import { useAuthStore } from '@/stores/authStore';
import { AuthPage } from '@/components/Auth';
import { LobbyPage } from '@/components/Lobby';
import { GamePage } from '@/components/GameBoard';
import { FlashBanner } from '@/components/FlashBanner';

export function AppRouter() {
  useSocketLifecycle();
  const token = useAuthStore((s) => s.token);

  return (
    <>
    <FlashBanner />
    <Routes>
      <Route
        path="/auth"
        element={token ? <Navigate to="/lobby" replace /> : <AuthPage />}
      />
      <Route
        path="/lobby"
        element={
          <ProtectedRoute>
            <LobbyPage mode="home" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lobby/room/:roomId"
        element={
          <ProtectedRoute>
            <LobbyPage mode="waiting" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/game/:roomId"
        element={
          <ProtectedRoute>
            <GamePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/lobby" replace />} />
    </Routes>
    </>
  );
}
