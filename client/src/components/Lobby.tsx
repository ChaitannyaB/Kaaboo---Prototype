import { useEffect, useState } from 'react';
import { App, Badge, Button, Input, List, Modal, Segmented, Tag } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore, getSocket } from '@/stores/socketStore';
import { useUiStore } from '@/stores/uiStore';
import { usePublicRooms } from '@/api/queries/rooms';
import { useDeleteAccount } from '@/api/queries/auth';
import { Friends } from './Friends';
import { StatsPanel } from './StatsPanel';
import { RulesModal } from './RulesModal';
import { PlayerToasts } from './PlayerToasts';
import { ChatPanel } from './ChatPanel';

interface LobbyProps { mode: 'home' | 'waiting'; }

export function LobbyPage({ mode }: LobbyProps) {
  const navigate = useNavigate();
  const params = useParams<{ roomId: string }>();
  const { message } = App.useApp();
  const currentUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const gameState = useGameStore((s) => s.gameState);
  const mySocketId = useSocketStore((s) => s.myId);
  const rulesOpen = useUiStore((s) => s.rulesOpen);
  const setRulesOpen = useUiStore((s) => s.setRulesOpen);
  const chatOpen = useUiStore((s) => s.chatOpen);
  const setChatOpen = useUiStore((s) => s.setChatOpen);

  const [joinCode, setJoinCode] = useState('');
  const [createPublic, setCreatePublic] = useState<'public' | 'private'>('public');
  const [roomFilter, setRoomFilter] = useState('');
  const [chatUnread, setChatUnread] = useState(0);
  const [formMode, setFormMode] = useState<'home' | 'create' | 'join'>('home');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const roomsQ = usePublicRooms({ enabled: formMode === 'join' });
  const deleteAccount = useDeleteAccount();

  const myPlayer = gameState?.players?.find((p) => p.id === mySocketId);
  const isHost = myPlayer?.isHost ?? false;

  // If URL says /lobby/room/:roomId but we don't have that state, assume user navigated back without room
  useEffect(() => {
    if (mode === 'waiting' && gameState && gameState.roomId !== params.roomId) {
      navigate('/lobby', { replace: true });
    }
  }, [mode, gameState, params.roomId, navigate]);

  function handleCreate() {
    getSocket().emit('create-room', { isPublic: createPublic === 'public' }, (res) => {
      if (res?.error) message.error(res.error);
    });
  }

  function handleJoin(roomId?: string) {
    const id = (roomId ?? joinCode).trim().toUpperCase();
    if (!id) { message.error('Enter a room code'); return; }
    getSocket().emit('join-room', { roomId: id }, (res) => {
      if (res?.error) message.error(res.error);
    });
  }

  function handleStart() {
    getSocket().emit('start-game', (res) => {
      if (res?.error) message.error(res.error);
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
      if (res?.error) message.error(res.error);
    });
  }

  async function handleDeleteAccount() {
    try {
      await deleteAccount.mutateAsync(deletePassword);
      setDeleteOpen(false);
      navigate('/auth');
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  // ── Waiting room view ───────────────────────────────────────────────────────
  if (mode === 'waiting' && gameState) {
    const myName = currentUser?.username ?? '';
    return (
      <div className="lobby-layout">
        <PlayerToasts players={gameState.players} />
        <ChatPanel
          myName={myName}
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          onUnread={() => setChatUnread((n) => n + 1)}
        />
        <div className="lobby-waiting">
          <div className="lobby-main-area">
            <div className="lobby-header flex items-center justify-between">
              <h1 className="title">Kaaboo</h1>
              <Badge count={chatUnread}>
                <Button icon={<MessageOutlined />} onClick={() => { setChatOpen(!chatOpen); setChatUnread(0); }}>Chat</Button>
              </Badge>
            </div>
            <p className="subtitle">Logged in as <strong>{currentUser?.username}</strong></p>

            <div className="room-code-box">
              <span className="room-code-label">Room Code</span>
              <span className="room-code">{gameState.roomId}</span>
              {isHost ? (
                <Button size="small" onClick={toggleVisibility}>
                  {gameState.isPublic ? '🌐 Public — click to make Private' : '🔒 Private — click to make Public'}
                </Button>
              ) : (
                <Tag color={gameState.isPublic ? 'green' : 'default'}>
                  {gameState.isPublic ? '🌐 Public' : '🔒 Private'}
                </Tag>
              )}
            </div>

            <div className="player-list">
              <h3>Players ({gameState.players.length})</h3>
              {gameState.players.map((p) => (
                <div key={p.id} className="player-row">
                  <span className="player-dot" />
                  <span>{p.name}</span>
                  {p.scoreBoard !== 0 && (
                    <Tag color={p.scoreBoard > 0 ? 'green' : 'red'}>
                      SB {p.scoreBoard > 0 ? `+${p.scoreBoard}` : p.scoreBoard}
                    </Tag>
                  )}
                  {p.isHost && <Tag color="gold">Host</Tag>}
                  {p.id === mySocketId && <Tag>You</Tag>}
                </div>
              ))}
            </div>

            {isHost ? (
              <Button
                type="primary"
                block
                disabled={gameState.players.length < 2}
                onClick={handleStart}
              >
                {gameState.players.length < 2 ? 'Waiting for players…' : 'Start Game'}
              </Button>
            ) : (
              <p className="waiting-text">Waiting for the host to start…</p>
            )}

            <div className="waiting-footer-actions flex gap-2 mt-3">
              <Button onClick={handleLeave}>Leave Room</Button>
              <Button onClick={logout}>Log Out</Button>
            </div>
          </div>
        </div>

        <Friends />
      </div>
    );
  }

  // ── Home view ───────────────────────────────────────────────────────────────
  const filteredRooms = (() => {
    const f = roomFilter.trim().toUpperCase();
    const rooms = roomsQ.data ?? [];
    if (!f) return rooms;
    return rooms.filter((r) => r.roomId.includes(f) || r.host.toUpperCase().includes(f));
  })();

  return (
    <div className="lobby-layout">
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

      <div className="lobby-home">
        <div className="lobby-main-area">
          <div className="lobby-header flex items-center justify-between">
            <h1 className="title">Kaaboo</h1>
            <Button onClick={logout}>Log Out</Button>
          </div>
          <p className="subtitle">Welcome, <strong>{currentUser?.username}</strong>!</p>

          {formMode === 'home' && (
            <div className="home-buttons flex flex-col gap-2">
              <Button type="primary" size="large" onClick={() => setFormMode('create')}>Create Room</Button>
              <Button size="large" onClick={() => setFormMode('join')}>Join Room</Button>
              <Button type="text" onClick={() => setRulesOpen(true)}>Rules &amp; Powers</Button>
            </div>
          )}

          {formMode === 'create' && (
            <div className="form-box">
              <h2>Create a Room</h2>
              <div className="visibility-toggle-group">
                <span className="visibility-toggle-label">Room Visibility</span>
                <Segmented
                  options={[
                    { label: '🌐 Public', value: 'public' },
                    { label: '🔒 Private', value: 'private' },
                  ]}
                  value={createPublic}
                  onChange={(v) => setCreatePublic(v as 'public' | 'private')}
                  block
                />
                <p className="visibility-hint">
                  {createPublic === 'public'
                    ? 'Anyone can find and join this room from the room browser.'
                    : 'Only players with the room code can join.'}
                </p>
              </div>
              <div className="form-actions flex gap-2">
                <Button onClick={() => setFormMode('home')}>Back</Button>
                <Button type="primary" onClick={handleCreate}>Create</Button>
              </div>
            </div>
          )}

          {formMode === 'join' && (
            <div className="join-panel">
              <div className="form-box">
                <h2>Join by Code</h2>
                <Input
                  placeholder="Room code (e.g. AB3XY)"
                  value={joinCode}
                  maxLength={5}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onPressEnter={() => handleJoin()}
                  autoFocus
                />
                <div className="form-actions flex gap-2 mt-2">
                  <Button onClick={() => { setFormMode('home'); setJoinCode(''); }}>Back</Button>
                  <Button type="primary" disabled={joinCode.length < 1} onClick={() => handleJoin()}>Join</Button>
                </div>
              </div>

              <div className="public-rooms-box">
                <div className="public-rooms-header flex items-center justify-between gap-2">
                  <h2 className="public-rooms-title">Public Rooms</h2>
                  <Input
                    placeholder="Filter by code or host…"
                    value={roomFilter}
                    onChange={(e) => setRoomFilter(e.target.value)}
                    style={{ maxWidth: 240 }}
                  />
                </div>
                <List
                  loading={roomsQ.isLoading}
                  dataSource={filteredRooms}
                  locale={{ emptyText: roomFilter ? 'No matching rooms.' : 'No public rooms open right now.' }}
                  renderItem={(r) => (
                    <List.Item
                      actions={[
                        <Button key="join" size="small" type="primary" onClick={() => handleJoin(r.roomId)}>Join</Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={<span><Tag color="gold">{r.roomId}</Tag> host: {r.host}</span>}
                        description={`${r.playerCount}/${r.maxPlayers} players`}
                      />
                    </List.Item>
                  )}
                />
              </div>
            </div>
          )}

          {formMode === 'home' && <StatsPanel inline />}

          {formMode === 'home' && (
            <div className="danger-zone mt-8">
              <Button danger onClick={() => setDeleteOpen(true)}>Delete Account</Button>
            </div>
          )}

          <Modal
            title="Delete your account?"
            open={deleteOpen}
            okText="Delete Forever"
            okButtonProps={{ danger: true, loading: deleteAccount.isPending, disabled: !deletePassword }}
            cancelText="Cancel"
            onOk={handleDeleteAccount}
            onCancel={() => { setDeleteOpen(false); setDeletePassword(''); }}
          >
            <p>This permanently removes your account, stats, and friendships. Enter your password to confirm.</p>
            <Input.Password
              placeholder="Your password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              onPressEnter={handleDeleteAccount}
              autoFocus
            />
          </Modal>
        </div>
      </div>

      <Friends />
    </div>
  );
}

