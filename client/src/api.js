const BASE = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

function token() { return localStorage.getItem('kaaboo_token') || ''; }

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  register: (d) => req('/api/auth/register', { method: 'POST', body: d }),
  login:    (d) => req('/api/auth/login',    { method: 'POST', body: d }),
  searchUsers:       (q)   => req(`/api/users/search?q=${encodeURIComponent(q)}`),
  getFriends:        ()    => req('/api/users/friends'),
  getFriendRequests: ()    => req('/api/users/friends/requests'),
  sendFriendRequest: (id)  => req('/api/users/friends/request', { method: 'POST', body: { addresseeId: id } }),
  respondToRequest:  (id, action) => req(`/api/users/friends/${id}`, { method: 'PUT', body: { action } }),
  removeFriend:      (id) => req(`/api/users/friends/${id}`, { method: 'DELETE' }),
  sendInvite:        (roomId, inviteeId) => req('/api/users/invites', { method: 'POST', body: { roomId, inviteeId } }),
  getInvites:        () => req('/api/users/invites'),
  deleteAccount:     (password) => req('/api/users/me', { method: 'DELETE', body: { password } }),
  getRooms:          () => req('/api/rooms'),
  getMyStats:        () => req('/api/users/me/stats'),
  getUserStats:      (id) => req(`/api/users/${id}/stats`),
};
