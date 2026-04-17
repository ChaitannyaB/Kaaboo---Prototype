const express = require('express');
const { db, newId } = require('../db');
const { requireAuth } = require('../middleware/auth');

module.exports = function createUsersRouter(io, onlineUsers) {
  const router = express.Router();

  // All routes require auth
  router.use(requireAuth);

  // GET /api/users/search?q=
  router.get('/search', (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ users: [] });
    const users = db.prepare(
      `SELECT id, username FROM users WHERE username LIKE ? AND id != ? LIMIT 20`
    ).all(`%${q}%`, req.user.userId);
    res.json({ users });
  });

  // GET /api/users/friends
  router.get('/friends', (req, res) => {
    const rows = db.prepare(`
      SELECT f.id AS friendshipId,
             CASE WHEN f.requester_id = ? THEN u2.id ELSE u1.id END AS id,
             CASE WHEN f.requester_id = ? THEN u2.username ELSE u1.username END AS username
      FROM friendships f
      JOIN users u1 ON u1.id = f.requester_id
      JOIN users u2 ON u2.id = f.addressee_id
      WHERE f.status = 'accepted'
        AND (f.requester_id = ? OR f.addressee_id = ?)
    `).all(req.user.userId, req.user.userId, req.user.userId, req.user.userId);
    res.json({ friends: rows });
  });

  // GET /api/users/friends/requests
  router.get('/friends/requests', (req, res) => {
    const rows = db.prepare(`
      SELECT f.id, u.id AS userId, u.username
      FROM friendships f
      JOIN users u ON u.id = f.requester_id
      WHERE f.addressee_id = ? AND f.status = 'pending'
    `).all(req.user.userId);
    res.json({ requests: rows });
  });

  // POST /api/users/friends/request
  router.post('/friends/request', (req, res) => {
    const { addresseeId } = req.body;
    if (!addresseeId) return res.status(400).json({ error: 'addresseeId required' });
    if (addresseeId === req.user.userId) return res.status(400).json({ error: 'Cannot add yourself' });

    const addressee = db.prepare('SELECT id, username FROM users WHERE id = ?').get(addresseeId);
    if (!addressee) return res.status(404).json({ error: 'User not found' });

    // Check if friendship already exists in either direction
    const existing = db.prepare(`
      SELECT id FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `).get(req.user.userId, addresseeId, addresseeId, req.user.userId);
    if (existing) return res.status(409).json({ error: 'Friend request already exists' });

    const id = newId();
    db.prepare('INSERT INTO friendships (id, requester_id, addressee_id) VALUES (?, ?, ?)').run(id, req.user.userId, addresseeId);

    // Real-time notification
    const addrSocket = onlineUsers.get(addresseeId);
    if (addrSocket) {
      io.to(addrSocket).emit('friend-request', {
        id,
        from: { id: req.user.userId, username: req.user.username },
      });
    }

    res.json({ ok: true, friendshipId: id });
  });

  // PUT /api/users/friends/:id
  router.put('/friends/:id', (req, res) => {
    const { action } = req.body;
    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'action must be accept or decline' });
    }

    const friendship = db.prepare('SELECT * FROM friendships WHERE id = ?').get(req.params.id);
    if (!friendship) return res.status(404).json({ error: 'Friend request not found' });

    // Only the addressee can respond
    if (friendship.addressee_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (friendship.status !== 'pending') {
      return res.status(400).json({ error: 'Request already handled' });
    }

    if (action === 'accept') {
      db.prepare('UPDATE friendships SET status = ? WHERE id = ?').run('accepted', req.params.id);

      // Notify requester
      const requesterSocket = onlineUsers.get(friendship.requester_id);
      if (requesterSocket) {
        io.to(requesterSocket).emit('friend-accepted', {
          by: { id: req.user.userId, username: req.user.username },
        });
      }
    } else {
      db.prepare('DELETE FROM friendships WHERE id = ?').run(req.params.id);
    }

    res.json({ ok: true });
  });

  // DELETE /api/users/friends/:id  — remove an accepted friendship
  router.delete('/friends/:id', (req, res) => {
    const friendship = db.prepare('SELECT * FROM friendships WHERE id = ?').get(req.params.id);
    if (!friendship) return res.status(404).json({ error: 'Friendship not found' });

    if (friendship.requester_id !== req.user.userId && friendship.addressee_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (friendship.status !== 'accepted') {
      return res.status(400).json({ error: 'Not an accepted friendship' });
    }

    db.prepare('DELETE FROM friendships WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // POST /api/users/invites
  router.post('/invites', (req, res) => {
    const { roomId, inviteeId } = req.body;
    if (!roomId || !inviteeId) return res.status(400).json({ error: 'roomId and inviteeId required' });

    // Must be friends
    const friendship = db.prepare(`
      SELECT id FROM friendships
      WHERE status = 'accepted'
        AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
    `).get(req.user.userId, inviteeId, inviteeId, req.user.userId);
    if (!friendship) return res.status(403).json({ error: 'Must be friends to invite' });

    // Idempotent: if pending invite already exists for same room+invitee, return existing
    const existing = db.prepare(`
      SELECT id FROM game_invites
      WHERE room_id = ? AND invitee_id = ? AND status = 'pending'
    `).get(roomId, inviteeId);
    if (existing) return res.json({ ok: true, inviteId: existing.id });

    const id = newId();
    db.prepare('INSERT INTO game_invites (id, room_id, inviter_id, invitee_id) VALUES (?, ?, ?, ?)').run(id, roomId, req.user.userId, inviteeId);

    // Real-time notification
    const inviteeSocket = onlineUsers.get(inviteeId);
    if (inviteeSocket) {
      io.to(inviteeSocket).emit('game-invite', {
        id,
        roomId,
        inviter: { id: req.user.userId, username: req.user.username },
      });
    }

    res.json({ ok: true, inviteId: id });
  });

  // GET /api/users/invites
  router.get('/invites', (req, res) => {
    const rows = db.prepare(`
      SELECT gi.id, gi.room_id AS roomId, u.username AS inviterUsername, gi.created_at AS createdAt
      FROM game_invites gi
      JOIN users u ON u.id = gi.inviter_id
      WHERE gi.invitee_id = ? AND gi.status = 'pending'
      ORDER BY gi.created_at DESC
    `).all(req.user.userId);
    res.json({ invites: rows });
  });

  // DELETE /api/users/me  — permanently delete own account
  router.delete('/me', async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required to confirm deletion' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bcrypt = require('bcryptjs');
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.userId);
    res.json({ ok: true });
  });

  // GET /api/users/me/stats  — own lifetime stats
  router.get('/me/stats', (req, res) => {
    const raw = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(req.user.userId);

    const s = raw ?? {
      rounds_played: 0, kaaboo_calls: 0, kaaboo_wins: 0, kaaboo_losses: 0,
      playdowns_attempted: 0, playdowns_succeeded: 0, penalties_received: 0,
      powers_used: 0, powers_skipped: 0, best_card_score: null, total_card_score: 0,
    };

    const scoreboard        = s.kaaboo_wins - s.kaaboo_losses;
    const winRate           = s.kaaboo_calls > 0
      ? +((s.kaaboo_wins / s.kaaboo_calls) * 100).toFixed(1)
      : null;
    const avgCardScore      = s.rounds_played > 0
      ? +((s.total_card_score / s.rounds_played).toFixed(1))
      : null;
    const playdownAccuracy  = s.playdowns_attempted > 0
      ? +((s.playdowns_succeeded / s.playdowns_attempted) * 100).toFixed(1)
      : null;

    res.json({
      stats: {
        roundsPlayed:        s.rounds_played,
        kaabooCalls:         s.kaaboo_calls,
        kaabooWins:          s.kaaboo_wins,
        kaabooLosses:        s.kaaboo_losses,
        scoreboard,
        winRate,             // % | null
        avgCardScore,        // number | null
        bestCardScore:       s.best_card_score,  // null until Kaaboo called
        playdownsAttempted:  s.playdowns_attempted,
        playdownsSucceeded:  s.playdowns_succeeded,
        penaltiesReceived:   s.penalties_received,
        playdownAccuracy,    // % | null
        powersUsed:          s.powers_used,
        powersSkipped:       s.powers_skipped,
      },
    });
  });

  // GET /api/users/:id/stats  — another user's public stats (for friend profiles)
  router.get('/:id/stats', (req, res) => {
    const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const raw = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(req.params.id);
    const s = raw ?? {
      rounds_played: 0, kaaboo_calls: 0, kaaboo_wins: 0, kaaboo_losses: 0,
      best_card_score: null,
    };

    res.json({
      username: target.username,
      stats: {
        roundsPlayed:  s.rounds_played,
        kaabooCalls:   s.kaaboo_calls,
        kaabooWins:    s.kaaboo_wins,
        kaabooLosses:  s.kaaboo_losses,
        scoreboard:    s.kaaboo_wins - s.kaaboo_losses,
        winRate:       s.kaaboo_calls > 0
          ? +((s.kaaboo_wins / s.kaaboo_calls) * 100).toFixed(1)
          : null,
        bestCardScore: s.best_card_score,
      },
    });
  });

  return router;
};
