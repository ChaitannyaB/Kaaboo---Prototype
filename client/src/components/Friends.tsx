import { useEffect, useMemo, useState } from 'react';
import {
  useFriends,
  useFriendRequests,
  useRemoveFriend,
  useRespondToRequest,
  useSearchUsers,
  useSendFriendRequest,
} from '@/api/queries/friends';
import { useDismissInvite, useInvites, useSendInvite } from '@/api/queries/invites';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore } from '@/stores/socketStore';
import { useUiStore } from '@/stores/uiStore';
import { StatsPanel } from './StatsPanel';

function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

interface FriendsProps {
  onJoinRoom?: (roomId: string) => void;
  onInviteSent?: () => void;
}

export function Friends({ onJoinRoom, onInviteSent }: FriendsProps = {}) {
  const gameState = useGameStore((s) => s.gameState);
  const mySocketId = useSocketStore((s) => s.myId);
  const collapsed = useUiStore((s) => s.socialCollapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleSocial);

  const invitesQ = useInvites();
  const requestsQ = useFriendRequests();
  const friendsQ = useFriends();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounced(searchQuery, 400);
  const searchQ = useSearchUsers(debouncedQuery);

  const [expandedStats, setExpandedStats] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState<Set<string>>(new Set());
  const [pendingAdd, setPendingAdd] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sendRequest = useSendFriendRequest();
  const respond = useRespondToRequest();
  const removeFriend = useRemoveFriend();
  const sendInvite = useSendInvite();
  const dismissInvite = useDismissInvite();

  const friends = friendsQ.data ?? [];
  const requests = requestsQ.data ?? [];
  const invites = invitesQ.data ?? [];
  const searchResults = searchQ.data ?? [];

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);
  const notifCount = invites.length + requests.length;
  const isHost = gameState?.players?.find((p) => p.id === mySocketId)?.isHost ?? false;
  const inLobby = gameState?.phase === 'lobby';

  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      if (a.online && !b.online) return -1;
      if (!a.online && b.online) return 1;
      return a.username.localeCompare(b.username);
    });
  }, [friends]);

  async function handleAddFriend(userId: string) {
    try {
      await sendRequest.mutateAsync(userId);
      setPendingAdd((s) => new Set([...s, userId]));
    } catch (err) {
      setErrors((e) => ({ ...e, [userId]: (err as Error).message }));
    }
  }

  async function handleRemoveFriend(friendshipId: string, friendId: string) {
    try {
      await removeFriend.mutateAsync(friendshipId);
      if (expandedStats === friendId) setExpandedStats(null);
    } catch (err) {
      setErrors((e) => ({ ...e, [`remove_${friendId}`]: (err as Error).message }));
    }
  }

  async function handleRespond(id: string, action: 'accept' | 'decline') {
    try {
      await respond.mutateAsync({ id, action });
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: (err as Error).message }));
    }
  }

  async function handleInvite(friendId: string) {
    if (!gameState?.roomId) return;
    try {
      await sendInvite.mutateAsync({ roomId: gameState.roomId, inviteeId: friendId });
      setInviteSent((s) => new Set([...s, friendId]));
      onInviteSent?.();
    } catch (err) {
      setErrors((e) => ({ ...e, [`invite_${friendId}`]: (err as Error).message }));
    }
  }

  function handleJoinInvite(roomId: string, inviteId: string) {
    void dismissInvite.mutateAsync(inviteId);
    onJoinRoom?.(roomId);
  }

  function handleDismissInvite(inviteId: string) {
    void dismissInvite.mutateAsync(inviteId);
  }

  return (
    <div className={`friends-panel${collapsed ? ' collapsed' : ''}`}>
      <div className="friends-panel-header">
        <h2 className="friends-panel-title">Social</h2>
        {collapsed && notifCount > 0 && <span className="notif-badge">{notifCount}</span>}
        <button className="friends-collapse-btn" onClick={toggleCollapsed} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Game Invites */}
      <div className="friends-section">
        <h3 className="friends-section-title">
          Game Invites
          {invites.length > 0 && <span className="notif-badge">{invites.length}</span>}
        </h3>
        {invites.length === 0 ? (
          <p className="friends-empty">No pending invites</p>
        ) : (
          invites.map((inv) => (
            <div key={inv.id} className="invite-row">
              <span className="invite-from">{inv.inviterUsername}</span>
              <span className="invite-room">#{inv.roomId}</span>
              <div className="invite-actions">
                <button className="btn-primary invite-btn" onClick={() => handleJoinInvite(inv.roomId, inv.id)}>
                  Join
                </button>
                <button className="btn-ghost invite-btn" onClick={() => handleDismissInvite(inv.id)}>
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Friend Requests */}
      {requests.length > 0 && (
        <div className="friends-section">
          <h3 className="friends-section-title">
            Friend Requests
            <span className="notif-badge">{requests.length}</span>
          </h3>
          {requests.map((req) => (
            <div key={req.id} className="friend-row">
              <span className="friend-name">{req.username}</span>
              <div className="friend-actions">
                <button className="btn-primary friend-btn" onClick={() => handleRespond(req.id, 'accept')}>
                  Accept
                </button>
                <button className="btn-ghost friend-btn" onClick={() => handleRespond(req.id, 'decline')}>
                  Decline
                </button>
              </div>
              {errors[req.id] && <span className="friend-error">{errors[req.id]}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Friends List */}
      <div className="friends-section">
        <h3 className="friends-section-title">Friends ({friends.length})</h3>
        {sortedFriends.length === 0 ? (
          <p className="friends-empty">No friends yet. Search below to add some!</p>
        ) : (
          sortedFriends.map((f) => {
            const inGame = gameState?.players?.find((p) => p.name === f.username);
            const canInvite = inLobby && isHost;
            const alreadyInvited = inviteSent.has(f.id);
            const statsOpen = expandedStats === f.id;
            return (
              <div key={f.id} className="friend-row" style={{ flexWrap: 'wrap' }}>
                {f.online && <span className="friend-online-dot" title="Online" />}
                <span className="friend-name">{f.username}</span>
                {inGame && typeof inGame.scoreBoard === 'number' && (
                  <span className="friend-sb-pip">
                    SB {inGame.scoreBoard > 0 ? `+${inGame.scoreBoard}` : inGame.scoreBoard}
                  </span>
                )}
                <button
                  className={`btn-ghost friend-btn friend-stats-toggle${statsOpen ? ' active' : ''}`}
                  onClick={() => setExpandedStats(statsOpen ? null : f.id)}
                >
                  Stats
                </button>
                {canInvite && (
                  <button
                    className={`btn-ghost friend-btn${alreadyInvited ? ' invited' : ''}`}
                    disabled={alreadyInvited}
                    onClick={() => handleInvite(f.id)}
                  >
                    {alreadyInvited ? 'Invited' : 'Invite'}
                  </button>
                )}
                {errors[`invite_${f.id}`] && <span className="friend-error">{errors[`invite_${f.id}`]}</span>}
                {errors[`remove_${f.id}`] && <span className="friend-error">{errors[`remove_${f.id}`]}</span>}
                <button
                  className="btn-ghost friend-btn friend-remove-btn"
                  onClick={() => handleRemoveFriend(f.friendshipId, f.id)}
                  title="Remove friend"
                >
                  ×
                </button>
                {statsOpen && (
                  <div className="friend-stats-inline">
                    <StatsPanel userId={f.id} inline />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Friends */}
      <div className="friends-section friends-search">
        <h3 className="friends-section-title">Add Friends</h3>
        <input
          className="input"
          placeholder="Search by username…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((u) => {
              const isFriend = friendIds.has(u.id);
              const isPending = pendingAdd.has(u.id);
              return (
                <div key={u.id} className="search-result-row">
                  <span className="friend-name">{u.username}</span>
                  {isFriend ? (
                    <span className="friends-label">Friends</span>
                  ) : isPending ? (
                    <span className="friends-label">Sent</span>
                  ) : (
                    <button className="btn-ghost friend-btn" onClick={() => handleAddFriend(u.id)}>
                      Add
                    </button>
                  )}
                  {errors[u.id] && <span className="friend-error">{errors[u.id]}</span>}
                </div>
              );
            })}
          </div>
        )}
        {debouncedQuery.length >= 2 && searchResults.length === 0 && (
          <p className="friends-empty">No users found</p>
        )}
      </div>
    </div>
  );
}
