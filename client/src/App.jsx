import { useState, useEffect, lazy, Suspense } from 'react';
import socket from './socket';
const Auth = lazy(() => import('./components/Auth'));
const Lobby = lazy(() => import('./components/Lobby'));
const GameBoard = lazy(() => import('./components/GameBoard'));

export default function App() {
  const [screen, setScreen] = useState('auth'); // 'auth' | 'lobby' | 'game'
  const [currentUser, setCurrentUser] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [myId, setMyId] = useState(null);
  const [error, setError] = useState('');

  // Restore session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('kaaboo_token');
    const savedUser = localStorage.getItem('kaaboo_user');
    if (savedToken && savedUser) {
      try {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);
        setScreen('lobby');
        socket.connect();
      } catch {
        localStorage.removeItem('kaaboo_token');
        localStorage.removeItem('kaaboo_user');
      }
    }
  }, []);

  useEffect(() => {
    socket.on('connect', () => setMyId(socket.id));

    socket.on('me', ({ userId, username }) => {
      // Server confirmed auth — update currentUser if needed
      setCurrentUser((prev) => prev ? { ...prev, id: userId, username } : null);
    });

    socket.on('game-state', (state) => {
      setGameState(state);
      if (state.phase !== 'lobby') {
        setScreen('game');
      } else {
        // If we're in lobby phase and on game screen, go back to lobby
        setScreen((s) => s === 'auth' ? s : 'lobby');
      }
    });

    socket.on('disconnect', () => {
      setScreen((s) => s === 'auth' ? s : 'lobby');
      setGameState(null);
      setError('Disconnected from server.');
    });

    return () => {
      socket.off('connect');
      socket.off('me');
      socket.off('game-state');
      socket.off('disconnect');
    };
  }, []);

  function handleLogin(user, token) {
    localStorage.setItem('kaaboo_token', token);
    localStorage.setItem('kaaboo_user', JSON.stringify(user));
    setCurrentUser(user);
    setScreen('lobby');
    socket.connect();
  }

  function handleLogout() {
    localStorage.removeItem('kaaboo_token');
    localStorage.removeItem('kaaboo_user');
    socket.disconnect();
    setCurrentUser(null);
    setGameState(null);
    setMyId(null);
    setError('');
    setScreen('auth');
  }

  function handleLeaveGame() {
    socket.disconnect();
    socket.connect();
    setScreen('lobby');
    setGameState(null);
  }

  function handleLeaveRoom() {
    socket.emit('leave-room');
    setGameState(null);
  }

  return (
    <div className="app">
      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      <Suspense fallback={<div className="loading">Loading…</div>}>
        {screen === 'auth' && (
          <Auth onLogin={handleLogin} />
        )}

        {screen === 'lobby' && (
          <Lobby
            currentUser={currentUser}
            mySocketId={myId}
            gameState={gameState}
            onError={setError}
            onLogout={handleLogout}
            onLeaveRoom={handleLeaveRoom}
          />
        )}

        {screen === 'game' && (
          <GameBoard
            gameState={gameState}
            myId={myId}
            onError={setError}
            onLeave={handleLeaveGame}
            currentUser={currentUser}
            onLogout={handleLogout}
          />
        )}
      </Suspense>
    </div>
  );
}
