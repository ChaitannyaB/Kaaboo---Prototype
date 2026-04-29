import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore, getSocket } from '@/stores/socketStore';
import { usePublicRooms } from '@/api/queries/rooms';
import { useDeleteAccount } from '@/api/queries/auth';
import { Friends } from './Friends';
import { StatsPanel } from './StatsPanel';
import { RulesModal } from './RulesModal';
import { PlayerToasts } from './PlayerToasts';
import { ChatPanel } from './ChatPanel';

interface LobbyProps { mode: 'home' | 'waiting'; }

type FormMode = 'home' | 'create' | 'join';

export function LobbyPage({ mode }: LobbyProps) {
  const navigate = useNavigate();
  const params = useParams<{ roomId: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const gameState = useGameStore((s) => s.gameState);
  const mySocketId = useSocketStore((s) => s.myId);
  const connected = useSocketStore((s) => s.connected);

  const [formMode, setFormMode] = useState<FormMode>('home');
  const [joinCode, setJoinCode] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [createPublic, setCreatePublic] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const [roomFilter, setRoomFilter] = useState('');

  const roomsQ = usePublicRooms({ enabled: formMode === 'join' });
  const deleteAccount = useDeleteAccount();

  const myPlayer = gameState?.players?.find((p) => p.id === mySocketId);
  const isHost = !!myPlayer?.isHost;

  useEffect(() => {
    if (mode === 'waiting' && gameState && gameState.roomId !== params.roomId) {
      navigate('/lobby', { replace: true });
    }
  }, [mode, gameState, params.roomId, navigate]);

  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(''), 4000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  function showError(msg: string) { setErrorMsg(msg); }

  function handleCreate() {
    getSocket().emit('create-room', { isPublic: createPublic }, (res) => {
      if (res?.error) showError(res.error);
    });
  }

  function handleJoin(roomId?: string) {
    const id = ((roomId ?? joinCode) || '').trim().toUpperCase();
    if (!id) { showError('Enter a room code.'); return; }
    getSocket().emit('join-room', { roomId: id }, (res) => {
      if (res?.error) showError(res.error);
    });
  }

  function handleStart() {
    getSocket().emit('start-game', (res) => {
      if (res?.error) showError(res.error);
    });
  }

  function handleLeave() {
    getSocket().emit('leave-room');
    useGameStore.getState().reset();
    navigate('/lobby');
  }

  function toggleVisibility() {
    if (!gameState) return;
    getSocket().emit('set-room-visibility', { isPublic: !gameState.isPublic }, (res) => {
      if (res?.error) showError(res.error);
    });
  }

  async function handleDeleteAccount() {
    setDeleteError('');
    try {
      await deleteAccount.mutateAsync(deletePassword);
      navigate('/auth');
    } catch (e) {
      setDeleteError((e as Error).message);
    }
  }

  // ── Waiting room ─────────────────────────────────────────────────────────────
  if (mode === 'waiting' && gameState) {
    return (
      <div className="lobby-layout">
        {!connected && (
          <div className="reconnect-banner" role="status" aria-live="polite">
            <span className="reconnect-icon" aria-hidden="true">
              <span className="reconnect-arc" />
              <span className="reconnect-arc" />
              <span className="reconnect-arc" />
            </span>
            <span>Reconnecting…</span>
          </div>
        )}
        {errorMsg && <div className="error-banner">{errorMsg}</div>}
        <PlayerToasts players={gameState.players} />
        <ChatPanel
          myName={currentUser?.username ?? ''}
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          onUnread={() => setChatUnread((n) => n + 1)}
        />
        <div className="lobby-waiting">
          <div className="lobby-main-area">
            <div className="lobby-header">
              <h1 className="title">Kaaboo</h1>
              <button
                className="btn-ghost btn-chat"
                onClick={() => { setChatOpen((o) => !o); setChatUnread(0); }}
                title="Chat"
              >
                💬{chatUnread > 0 && <span className="chat-unread-badge">{chatUnread}</span>}
              </button>
            </div>
            <p className="subtitle">Logged in as <strong>{currentUser?.username}</strong></p>

            <div className="room-code-box">
              <span className="room-code-label">Room Code</span>
              <span className="room-code">{gameState.roomId}</span>
              {isHost ? (
                <button
                  className={`btn-ghost room-visibility-btn${gameState.isPublic ? ' vis-public' : ' vis-private'}`}
                  onClick={toggleVisibility}
                  title="Toggle room visibility"
                >
                  {gameState.isPublic ? '🌐 Public — click to make Private' : '🔒 Private — click to make Public'}
                </button>
              ) : (
                <span className={`room-visibility-badge${gameState.isPublic ? ' vis-public' : ' vis-private'}`}>
                  {gameState.isPublic ? '🌐 Public' : '🔒 Private'}
                </span>
              )}
              {!isHost && <span className="room-code-hint">Ask the host for the room code</span>}
            </div>

            <div className="player-list">
              <h3>Players ({gameState.players.length})</h3>
              {gameState.players.map((p) => (
                <div key={p.id} className="player-row">
                  <span className="player-dot" />
                  <span>{p.name}</span>
                  {p.scoreBoard !== undefined && p.scoreBoard !== 0 && (
                    <span className={`sb-pip sb-pip-${p.scoreBoard > 0 ? 'pos' : 'neg'}`}>
                      SB {p.scoreBoard > 0 ? `+${p.scoreBoard}` : p.scoreBoard}
                    </span>
                  )}
                  {p.isHost && <span className="host-badge">Host</span>}
                  {p.id === mySocketId && <span className="you-badge">You</span>}
                </div>
              ))}
            </div>

            {isHost ? (
              <button
                className="btn-primary"
                disabled={gameState.players.length < 2}
                onClick={handleStart}
              >
                {gameState.players.length < 2 ? 'Waiting for players…' : 'Start Game'}
              </button>
            ) : (
              <p className="waiting-text">Waiting for the host to start…</p>
            )}

            <div className="waiting-footer-actions">
              <button className="btn-ghost" onClick={handleLeave}>Leave Room</button>
              <button className="btn-ghost" onClick={logout}>Log Out</button>
            </div>
          </div>
        </div>

        <Friends onJoinRoom={(roomId: string) => handleJoin(roomId)} />
      </div>
    );
  }

  // ── Home ─────────────────────────────────────────────────────────────────────
  return (
    <div className="lobby-layout">
      {!connected && (
        <div className="reconnect-banner" role="status" aria-live="polite">
          <span className="reconnect-icon" aria-hidden="true">
            <span className="reconnect-arc" />
            <span className="reconnect-arc" />
            <span className="reconnect-arc" />
          </span>
          <span>Reconnecting…</span>
        </div>
      )}
      {errorMsg && <div className="error-banner">{errorMsg}</div>}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      <div className="lobby-home">
        <div className="lobby-main-area">
          <div className="lobby-header">
            <h1 className="title">Kaaboo</h1>
            <button className="btn-ghost btn-logout" onClick={logout}>Log Out</button>
          </div>
          <p className="subtitle">Welcome, <strong>{currentUser?.username}</strong>!</p>

          {formMode === 'home' && (
            <div className="home-buttons">
              <button className="btn-primary" onClick={() => setFormMode('create')}>Create Room</button>
              <button className="btn-secondary" onClick={() => setFormMode('join')}>Join Room</button>
              <button className="btn-ghost" onClick={() => setShowRules(true)}>Rules &amp; Powers</button>
            </div>
          )}

          {formMode === 'create' && (
            <div className="form-box">
              <h2>Create a Room</h2>

              <div className="visibility-toggle-group">
                <span className="visibility-toggle-label">Room Visibility</span>
                <div className="visibility-toggle">
                  <button
                    className={`vis-btn${createPublic ? ' vis-btn-active' : ''}`}
                    onClick={() => setCreatePublic(true)}
                  >
                    🌐 Public
                  </button>
                  <button
                    className={`vis-btn${!createPublic ? ' vis-btn-active' : ''}`}
                    onClick={() => setCreatePublic(false)}
                  >
                    🔒 Private
                  </button>
                </div>
                <p className="visibility-hint">
                  {createPublic
                    ? 'Anyone can find and join this room from the room browser.'
                    : 'Only players with the room code can join.'}
                </p>
              </div>

              <div className="form-actions">
                <button className="btn-ghost" onClick={() => setFormMode('home')}>Back</button>
                <button className="btn-primary" onClick={handleCreate}>Create</button>
              </div>
            </div>
          )}

          {formMode === 'join' && (
            <div className="join-panel">
              <div className="form-box">
                <h2>Join by Code</h2>
                <input
                  className="input input-code"
                  placeholder="Room code (e.g. AB3XY)"
                  value={joinCode}
                  maxLength={5}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  autoFocus
                />
                <div className="form-actions">
                  <button className="btn-ghost" onClick={() => { setFormMode('home'); setJoinCode(''); }}>Back</button>
                  <button className="btn-primary" disabled={joinCode.length < 1} onClick={() => handleJoin()}>Join</button>
                </div>
              </div>

              <div className="public-rooms-box">
                <div className="public-rooms-header">
                  <h2 className="public-rooms-title">Public Rooms</h2>
                  <input
                    className="input public-rooms-search"
                    placeholder="Filter by code or host…"
                    value={roomFilter}
                    onChange={(e) => setRoomFilter(e.target.value)}
                  />
                </div>

                {(() => {
                  const rooms = roomsQ.data ?? [];
                  if (roomsQ.isLoading && rooms.length === 0) {
                    return <p className="public-rooms-empty">Loading…</p>;
                  }
                  const f = roomFilter.trim().toUpperCase();
                  const filtered = f
                    ? rooms.filter((r) => r.roomId.includes(f) || r.host.toUpperCase().includes(f))
                    : rooms;
                  if (filtered.length === 0) {
                    return <p className="public-rooms-empty">{f ? 'No matching rooms.' : 'No public rooms open right now.'}</p>;
                  }
                  return (
                    <div className="public-rooms-list">
                      {filtered.map((r) => (
                        <div key={r.roomId} className="public-room-row">
                          <span className="public-room-id">{r.roomId}</span>
                          <span className="public-room-host">host: {r.host}</span>
                          <span className="public-room-players">{r.playerCount}/{r.maxPlayers}</span>
                          <button className="btn-primary public-room-join" onClick={() => handleJoin(r.roomId)}>
                            Join
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {formMode === 'home' && <StatsPanel inline />}

          {formMode === 'home' && (
            <div className="danger-zone">
              {deleteStep === 'idle' && (
                <button className="btn-delete-account" onClick={() => setDeleteStep('confirm')}>
                  Delete Account
                </button>
              )}

              {deleteStep === 'confirm' && (
                <div className="delete-confirm-box">
                  <p className="delete-confirm-title">Delete your account?</p>
                  <p className="delete-confirm-desc">
                    This permanently removes your account, stats, and friendships. Enter your password to confirm.
                  </p>
                  <input
                    className="input"
                    type="password"
                    placeholder="Your password"
                    value={deletePassword}
                    onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleDeleteAccount()}
                    autoFocus
                  />
                  {deleteError && <p className="delete-error">{deleteError}</p>}
                  <div className="form-actions">
                    <button className="btn-ghost" onClick={() => { setDeleteStep('idle'); setDeletePassword(''); setDeleteError(''); }}>
                      Cancel
                    </button>
                    <button
                      className="btn-danger"
                      disabled={!deletePassword || deleteAccount.isPending}
                      onClick={handleDeleteAccount}
                    >
                      {deleteAccount.isPending ? 'Deleting…' : 'Delete Forever'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Friends
        onJoinRoom={(roomId: string) => {
          setJoinCode(roomId);
          handleJoin(roomId);
        }}
      />
    </div>
  );
}
