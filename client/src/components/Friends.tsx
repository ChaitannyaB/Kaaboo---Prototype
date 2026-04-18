import { useEffect, useMemo, useState } from 'react';
import { App, Badge, Button, Collapse, Input, List, Popconfirm, Tabs, Tag } from 'antd';
import { LeftOutlined, RightOutlined, UserAddOutlined } from '@ant-design/icons';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { useFriends, useFriendRequests, useRemoveFriend, useRespondToRequest, useSearchUsers, useSendFriendRequest } from '@/api/queries/friends';
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

export function Friends() {
  const navigate = useNavigate();
  const { message } = App.useApp();
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

  async function handleAdd(userId: string) {
    try { await sendRequest.mutateAsync(userId); message.success('Request sent'); }
    catch (e) { message.error((e as Error).message); }
  }

  async function handleRespond(id: string, action: 'accept' | 'decline') {
    try { await respond.mutateAsync({ id, action }); }
    catch (e) { message.error((e as Error).message); }
  }

  async function handleRemove(friendshipId: string) {
    try { await removeFriend.mutateAsync(friendshipId); }
    catch (e) { message.error((e as Error).message); }
  }

  async function handleInvite(friendId: string) {
    if (!gameState?.roomId) return;
    try {
      await sendInvite.mutateAsync({ roomId: gameState.roomId, inviteeId: friendId });
      setInviteSent((s) => new Set([...s, friendId]));
      message.success('Invite sent');
    } catch (e) { message.error((e as Error).message); }
  }

  function handleJoin(roomId: string, inviteId: string) {
    void dismissInvite.mutateAsync(inviteId);
    navigate(`/lobby/room/${roomId}`);
  }

  return (
    <div className={clsx('friends-panel', collapsed && 'collapsed')}>
      <div className="friends-panel-header flex items-center justify-between gap-2 px-3 py-2">
        <h2 className="friends-panel-title text-base font-semibold">Social</h2>
        <div className="flex items-center gap-2">
          {collapsed && notifCount > 0 && <Badge count={notifCount} />}
          <Button
            size="small"
            type="text"
            icon={collapsed ? <RightOutlined /> : <LeftOutlined />}
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
          />
        </div>
      </div>

      {!collapsed && (
        <Tabs
          defaultActiveKey="friends"
          items={[
            {
              key: 'invites',
              label: <Badge count={invites.length} size="small" offset={[10, 0]}>Invites</Badge>,
              children: invites.length === 0 ? (
                <p className="friends-empty text-inkDim">No pending invites</p>
              ) : (
                <List
                  dataSource={invites}
                  renderItem={(inv) => (
                    <List.Item
                      actions={[
                        <Button key="join" size="small" type="primary" onClick={() => handleJoin(inv.roomId, inv.id)}>Join</Button>,
                        <Button key="dismiss" size="small" type="text" onClick={() => dismissInvite.mutate(inv.id)}>×</Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={inv.inviterUsername}
                        description={<Tag color="gold">#{inv.roomId}</Tag>}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'requests',
              label: <Badge count={requests.length} size="small" offset={[10, 0]}>Requests</Badge>,
              children: requests.length === 0 ? (
                <p className="friends-empty text-inkDim">No pending friend requests</p>
              ) : (
                <List
                  dataSource={requests}
                  renderItem={(req) => (
                    <List.Item
                      actions={[
                        <Button key="accept" size="small" type="primary" onClick={() => handleRespond(req.id, 'accept')}>Accept</Button>,
                        <Button key="decline" size="small" onClick={() => handleRespond(req.id, 'decline')}>Decline</Button>,
                      ]}
                    >
                      <List.Item.Meta title={req.username} />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'friends',
              label: `Friends (${friends.length})`,
              children: (
                <>
                  {sortedFriends.length === 0 ? (
                    <p className="friends-empty text-inkDim">No friends yet. Use the search below.</p>
                  ) : (
                    <List
                      dataSource={sortedFriends}
                      renderItem={(f) => {
                        const inGame = gameState?.players?.find((p) => p.name === f.username);
                        const canInvite = inLobby && isHost;
                        const alreadyInvited = inviteSent.has(f.id);
                        return (
                          <>
                            <List.Item
                              actions={[
                                <Button key="stats" size="small" type="text" onClick={() => setExpandedStats(expandedStats === f.id ? null : f.id)}>
                                  Stats
                                </Button>,
                                canInvite && (
                                  <Button key="invite" size="small" disabled={alreadyInvited} onClick={() => handleInvite(f.id)}>
                                    {alreadyInvited ? 'Invited' : 'Invite'}
                                  </Button>
                                ),
                                <Popconfirm key="remove" title={`Remove ${f.username}?`} onConfirm={() => handleRemove(f.friendshipId)} okText="Remove" cancelText="Cancel">
                                  <Button size="small" type="text">×</Button>
                                </Popconfirm>,
                              ].filter(Boolean) as React.ReactNode[]}
                            >
                              <List.Item.Meta
                                title={
                                  <span>
                                    {f.online && <Badge status="success" />}
                                    {f.username}
                                    {inGame && <Tag style={{ marginLeft: 8 }}>SB {inGame.scoreBoard > 0 ? `+${inGame.scoreBoard}` : inGame.scoreBoard}</Tag>}
                                  </span>
                                }
                              />
                            </List.Item>
                            {expandedStats === f.id && (
                              <div className="px-4 pb-3">
                                <StatsPanel userId={f.id} inline />
                              </div>
                            )}
                          </>
                        );
                      }}
                    />
                  )}
                  <Collapse
                    className="mt-3"
                    items={[{
                      key: 'add',
                      label: <span><UserAddOutlined /> Add Friends</span>,
                      children: (
                        <>
                          <Input.Search
                            placeholder="Search by username…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            allowClear
                          />
                          {debouncedQuery.length >= 2 && (
                            <List
                              className="mt-2"
                              dataSource={searchResults}
                              locale={{ emptyText: 'No users found' }}
                              renderItem={(u) => {
                                const isFriend = friendIds.has(u.id);
                                return (
                                  <List.Item
                                    actions={[
                                      isFriend
                                        ? <Tag key="f">Friends</Tag>
                                        : <Button key="add" size="small" onClick={() => handleAdd(u.id)}>Add</Button>,
                                    ]}
                                  >
                                    <List.Item.Meta title={u.username} />
                                  </List.Item>
                                );
                              }}
                            />
                          )}
                        </>
                      ),
                    }]}
                  />
                </>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

