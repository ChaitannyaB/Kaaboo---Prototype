import { useState, useEffect, useRef, useCallback } from 'react';
import socket from '../socket';
import { api } from '../api';
import StatsPanel from './StatsPanel';

export default function Friends({ currentUser, gameState, mySocketId, onInviteSent, onJoinRoom }) {
  const [invites, setInvites] = useState([]);
  const [requests, setRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pendingAdd, setPendingAdd] = useState(new Set()); // ids of sent requests
  const [inviteSent, setInviteSent] = useState(new Set()); // friendIds that got invite
  const [errors, setErrors] = useState({});
  const [expandedStats, setExpandedStats] = useState(null); // friendId with stats open
  const debounceRef = useRef(null);

  const loadAll = useCallback(async () => {
    try {
      const [inv, req, fr] = await Promise.all([
        api.getInvites(),
        api.getFriendRequests(),
        api.getFriends(),
      ]);
      setInvites(inv.invites || []);
      setRequests(req.requests || []);
      setFriends(fr.friends || []);
    } catch (err) {
      console.error('[friends] load error:', err);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    function onFriendRequest(data) {
      setRequests((prev) => {
        if (prev.find((r) => r.id === data.id)) return prev;
        return [...prev, { id: data.id, userId: data.from.id, username: data.from.username }];
      });
    }
    function onFriendAccepted(data) {
      loadAll();
    }
    function onGameInvite(data) {
      setInvites((prev) => {
        if (prev.find((i) => i.id === data.id)) return prev;
        return [...prev, { id: data.id, roomId: data.roomId, inviterUsername: data.inviter.username, createdAt: Date.now() / 1000 }];
      });
    }

    socket.on('friend-request', onFriendRequest);
    socket.on('friend-accepted', onFriendAccepted);
    socket.on('game-invite', onGameInvite);
    return () => {
      socket.off('friend-request', onFriendRequest);
      socket.off('friend-accepted', onFriendAccepted);
      socket.off('game-invite', onGameInvite);
    };
  }, [loadAll]);

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const { users } = await api.searchUsers(searchQuery);
        setSearchResults(users || []);
      } catch {}
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  async function handleAddFriend(userId) {
    try {
      await api.sendFriendRequest(userId);
      setPendingAdd((s) => new Set([...s, userId]));
    } catch (err) {
      setErrors((e) => ({ ...e, [userId]: err.message }));
    }
  }

  async function handleRemoveFriend(friendshipId, friendId) {
    try {
      await api.removeFriend(friendshipId);
      setFriends((prev) => prev.filter((f) => f.id !== friendId));
      if (expandedStats === friendId) setExpandedStats(null);
    } catch (err) {
      setErrors((e) => ({ ...e, [`remove_${friendId}`]: err.message }));
    }
  }

  async function handleRespond(id, action) {
    try {
      await api.respondToRequest(id, action);
      setRequests((prev) => prev.filter((r) => r.id !== id));
      if (action === 'accept') await loadAll();
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: err.message }));
    }
  }

  async function handleInvite(friendId) {
    if (!gameState?.roomId) return;
    try {
      await api.sendInvite(gameState.roomId, friendId);
      setInviteSent((s) => new Set([...s, friendId]));
      onInviteSent?.();
    } catch (err) {
      setErrors((e) => ({ ...e, [`invite_${friendId}`]: err.message }));
    }
  }

  function handleJoin(roomId) {
    // Remove invite from list
    setInvites((prev) => prev.filter((i) => i.roomId !== roomId));
    onJoinRoom?.(roomId);
  }

  function dismissInvite(inviteId) {
    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
  }

  const friendIds = new Set(friends.map((f) => f.id));
  const isHost = gameState?.players?.find((p) => p.id === mySocketId)?.isHost;
  const inLobby = gameState?.phase === 'lobby';

  return (
    <div className="friends-panel">
      <h2 className="friends-panel-title">Social</h2>

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
                <button className="btn-primary invite-btn" onClick={() => handleJoin(inv.roomId)}>
                  Join
                </button>
                <button className="btn-ghost invite-btn" onClick={() => dismissInvite(inv.id)}>
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
        {friends.length === 0 ? (
          <p className="friends-empty">No friends yet. Search below to add some!</p>
        ) : (
          friends.map((f) => {
            const inGame = gameState?.players?.find((p) => p.name === f.username);
            const canInvite = inLobby && isHost;
            const alreadyInvited = inviteSent.has(f.id);
            const statsOpen = expandedStats === f.id;
            return (
              <div key={f.id} className="friend-row" style={{ flexWrap: 'wrap' }}>
                <span className="friend-name">{f.username}</span>
                {inGame && (
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
      <div className="friends-section">
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
        {searchQuery.length >= 2 && searchResults.length === 0 && (
          <p className="friends-empty">No users found</p>
        )}
      </div>
    </div>
  );
}
