const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { GameRoom, getPowerInfo } = require('./game/GameRoom');
const { socketAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const createUsersRouter = require('./routes/users');
const { db } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

const rooms      = new Map();
const peekTimers = new Map();
const pdTimers   = new Map();
const gcTimers   = new Map();
const pdecTimers = new Map();
const pactTimers = new Map();

const onlineUsers = new Map(); // userId -> socketId

// roundStats: roomId -> Map<socketId, { playdownsAttempted, playdownsSucceeded, penaltiesReceived, powersUsed, powersSkipped }>
// Accumulates per-round stats; flushed to DB when game ends.
const roundStats = new Map();

// Mount REST routes
app.use('/api/auth', authRouter);
app.use('/api/users', createUsersRouter(io, onlineUsers));

// ── DB helpers ────────────────────────────────────────────────────────────────

// Load a player's scoreBoard from DB (wins - losses). Returns 0 if no stats yet.
function loadScoreBoard(userId) {
  if (!userId) return 0;
  const row = db.prepare('SELECT kaaboo_wins, kaaboo_losses FROM user_stats WHERE user_id = ?').get(userId);
  return row ? row.kaaboo_wins - row.kaaboo_losses : 0;
}

// Initialize a clean per-round stat counter for one player.
function emptyRoundStat() {
  return { playdownsAttempted: 0, playdownsSucceeded: 0, penaltiesReceived: 0, powersUsed: 0, powersSkipped: 0 };
}

// Write all per-round stats to DB after a game ends.
const upsertStats = db.prepare(`
  INSERT INTO user_stats (
    user_id, rounds_played, kaaboo_calls, kaaboo_wins, kaaboo_losses,
    playdowns_attempted, playdowns_succeeded, penalties_received,
    powers_used, powers_skipped, best_card_score, total_card_score
  ) VALUES (
    @userId, 1, @kc, @kw, @kl,
    @pda, @pds, @pr,
    @pu, @ps, @bcs, @tcs
  )
  ON CONFLICT(user_id) DO UPDATE SET
    rounds_played       = rounds_played + 1,
    kaaboo_calls        = kaaboo_calls        + @kc,
    kaaboo_wins         = kaaboo_wins         + @kw,
    kaaboo_losses       = kaaboo_losses       + @kl,
    playdowns_attempted = playdowns_attempted + @pda,
    playdowns_succeeded = playdowns_succeeded + @pds,
    penalties_received  = penalties_received  + @pr,
    powers_used         = powers_used         + @pu,
    powers_skipped      = powers_skipped      + @ps,
    best_card_score     = CASE
                            WHEN @bcs IS NOT NULL AND (best_card_score IS NULL OR @bcs < best_card_score)
                            THEN @bcs ELSE best_card_score
                          END,
    total_card_score    = total_card_score    + @tcs
`);

function flushRoundStats(roomId, room) {
  const rs = roundStats.get(roomId);
  if (!rs) return;

  for (const player of room.players) {
    if (!player.userId) continue;

    const stat   = rs.get(player.id) || emptyRoundStat();
    const cardScore = room.calculatePlayerScore(player.id) ?? 0;
    const isCallerSocket = room.kaabooCallerId === player.id;

    upsertStats.run({
      userId: player.userId,
      kc:  isCallerSocket ? 1 : 0,
      kw:  isCallerSocket && room._kaabooCallerWon ? 1 : 0,
      kl:  isCallerSocket && !room._kaabooCallerWon ? 1 : 0,
      pda: stat.playdownsAttempted,
      pds: stat.playdownsSucceeded,
      pr:  stat.penaltiesReceived,
      pu:  stat.powersUsed,
      ps:  stat.powersSkipped,
      // best_card_score only tracked for Kaaboo callers (their declared score)
      bcs: isCallerSocket ? cardScore : null,
      tcs: cardScore,
    });
  }

  roundStats.delete(roomId);
  console.log(`[stats] flushed round stats for ${roomId}`);
}

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function broadcastRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const p of room.players) {
    io.to(p.id).emit('game-state', room.getPlayerState(p.id));
  }
}

// ── Turn advancement ──────────────────────────────────────────────────────────
// Central function: advances the turn and checks whether the Kaaboo caller's
// turn has come around again (triggering game end).
// Returns true if the game ended.
function advanceTurnAndCheck(roomId) {
  const r = rooms.get(roomId);
  if (!r || r.phase !== 'playing') {
    broadcastRoom(roomId);
    return false;
  }
  r.nextTurn();
  if (r.kaabooCallerId && r.currentTurnPlayerId === r.kaabooCallerId) {
    r.endGame();
    console.log(`[game] ${roomId} — Kaaboo resolved (${r._kaabooCallerWon ? 'caller won' : 'caller lost'})`);
    flushRoundStats(roomId, r);
  }
  broadcastRoom(roomId);
  return r.phase === 'finished';
}

// ── Timer helpers ─────────────────────────────────────────────────────────────

function openPlaydown(roomId, discardType, currentTurnPlayerId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.openPlaydownWindow(discardType, currentTurnPlayerId);
  broadcastRoom(roomId);

  clearTimeout(pdTimers.get(roomId));
  pdTimers.set(roomId, setTimeout(() => {
    const r = rooms.get(roomId);
    pdTimers.delete(roomId);
    if (!r?.playdownWindow) return;

    r.closePlaydownWindow();

    // Power trigger: only when play-down window expires naturally (no claim)
    // and only for drawn-card discards with a power rank.
    const ld = r._lastDiscard;
    if (ld?.wasDrawn && getPowerInfo(ld.rank)) {
      if (r.openPowerDecisionWindow(r.currentTurnPlayerId, ld.rank)) {
        broadcastRoom(roomId);
        startPowerDecisionTimer(roomId);
        return;
      }
    }

    advanceTurnAndCheck(roomId);
    console.log(`[pd] ${roomId} window expired`);
  }, 3_000));
}

function openGiveCard(roomId, giverId, receiverId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.openGiveCardWindow(giverId, receiverId);
  broadcastRoom(roomId);

  clearTimeout(gcTimers.get(roomId));
  gcTimers.set(roomId, setTimeout(() => {
    const r = rooms.get(roomId);
    gcTimers.delete(roomId);
    if (!r?.giveCardWindow) return;
    r.giveRandomCard();
    advanceTurnAndCheck(roomId);
    console.log(`[gc] ${roomId} timeout — random card given`);
  }, 5_000));
}

function startPowerDecisionTimer(roomId) {
  clearTimeout(pdecTimers.get(roomId));
  pdecTimers.set(roomId, setTimeout(() => {
    const r = rooms.get(roomId);
    pdecTimers.delete(roomId);
    if (!r?.powerWindow || r.powerWindow.phase !== 'decision') return;
    // Count as skipped (timeout = no action taken)
    const ps = roundStats.get(roomId)?.get(r.powerWindow.playerId);
    if (ps) ps.powersSkipped++;
    r.closePowerWindow();
    advanceTurnAndCheck(roomId);
    console.log(`[pow] ${roomId} decision timeout`);
  }, 5_000));
}

function startPowerActionTimer(roomId) {
  clearTimeout(pactTimers.get(roomId));
  pactTimers.set(roomId, setTimeout(() => {
    const r = rooms.get(roomId);
    pactTimers.delete(roomId);
    if (!r?.powerWindow || r.powerWindow.phase !== 'action') return;
    r.closePowerWindow();
    advanceTurnAndCheck(roomId);
    console.log(`[pow] ${roomId} action timeout`);
  }, 20_000));
}

function resolvePower(roomId) {
  clearTimeout(pactTimers.get(roomId));
  pactTimers.delete(roomId);
  const r = rooms.get(roomId);
  if (!r) return;
  r.closePowerWindow();
  advanceTurnAndCheck(roomId);
}

app.get('/health', (_, res) => res.json({ ok: true }));

// GET /api/rooms — list public rooms currently in lobby phase
app.get('/api/rooms', (req, res) => {
  const list = [];
  for (const [id, room] of rooms) {
    if (room.isPublic && room.phase === 'lobby') {
      list.push({
        roomId: id,
        playerCount: room.players.length,
        maxPlayers: 8,
        host: room.players.find((p) => p.isHost)?.name ?? '?',
      });
    }
  }
  res.json({ rooms: list });
});

// ── Socket middleware ─────────────────────────────────────────────────────────
io.use(socketAuth(io));

// ── Socket handlers ───────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  // Track authenticated users and send them their identity
  if (socket.data.userId) {
    onlineUsers.set(socket.data.userId, socket.id);
    socket.emit('me', { userId: socket.data.userId, username: socket.data.username });
  }

  socket.on('create-room', ({ isPublic = true } = {}, cb) => {
    if (!socket.data.userId) return cb?.({ error: 'Login required' });
    const playerName = socket.data.username;
    const scoreBoard = loadScoreBoard(socket.data.userId);
    let roomId;
    do { roomId = generateRoomId(); } while (rooms.has(roomId));
    const room = new GameRoom(roomId, socket.id, playerName, socket.data.userId, scoreBoard, Boolean(isPublic));
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;
    console.log(`[room] ${roomId} created by ${playerName} (${isPublic ? 'public' : 'private'})`);
    cb?.({ roomId });
    broadcastRoom(roomId);
  });

  socket.on('set-room-visibility', ({ isPublic }, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    const player = room.players.find((p) => p.id === socket.id);
    if (!player?.isHost) return cb?.({ error: 'Only the host can change visibility' });
    if (room.phase !== 'lobby') return cb?.({ error: 'Cannot change visibility after game starts' });
    room.isPublic = Boolean(isPublic);
    cb?.({ ok: true });
    broadcastRoom(socket.data.roomId);
  });

  socket.on('join-room', ({ roomId }, cb) => {
    if (!socket.data.userId) return cb?.({ error: 'Login required' });
    const playerName = socket.data.username;
    const id = roomId?.toUpperCase();
    const room = rooms.get(id);
    if (!room) return cb?.({ error: 'Room not found' });
    const scoreBoard = loadScoreBoard(socket.data.userId);
    const result = room.addPlayer(socket.id, playerName, false, socket.data.userId, scoreBoard);
    if (result.error) return cb?.(result);
    socket.join(id);
    socket.data.roomId = id;
    console.log(`[room] ${playerName} joined ${id}`);
    cb?.({ ok: true });
    broadcastRoom(id);
  });

  socket.on('start-game', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    const player = room.players.find((p) => p.id === socket.id);
    if (!player?.isHost) return cb?.({ error: 'Only the host can start' });
    const result = room.startGame();
    if (result.error) return cb?.(result);

    // Initialise per-round stat counters for every player in the room
    const rsMap = new Map();
    for (const p of room.players) rsMap.set(p.id, emptyRoundStat());
    roundStats.set(socket.data.roomId, rsMap);

    console.log(`[game] ${socket.data.roomId} started (round ${room.roundNumber})`);
    cb?.({ ok: true });
    broadcastRoom(socket.data.roomId);

    const roomId = socket.data.roomId;
    peekTimers.set(roomId, setTimeout(() => {
      const r = rooms.get(roomId);
      if (r?.phase === 'peek') { r.endPeek(); broadcastRoom(roomId); }
      peekTimers.delete(roomId);
    }, 10_000));
  });

  // ── Call Kaaboo ────────────────────────────────────────────────────────────
  socket.on('call-kaaboo', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    const result = room.callKaaboo(socket.id);
    if (result.error) return cb?.(result);
    console.log(`[kaaboo] ${socket.id} called Kaaboo in ${socket.data.roomId}`);
    cb?.({ ok: true });
    // Skip the caller's turn (turn advances to next player, game might end immediately
    // only if n=1 other player already had their turn — but that can't happen on first call)
    advanceTurnAndCheck(socket.data.roomId);
  });

  // ── Draw card ──────────────────────────────────────────────────────────────
  socket.on('draw-card', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    if (room.phase !== 'playing') return cb?.({ error: 'Not in playing phase' });
    if (room.currentTurnPlayerId !== socket.id) return cb?.({ error: 'Not your turn' });
    if (room.playdownWindow || room.giveCardWindow || room.powerWindow) {
      return cb?.({ error: 'Cannot draw right now' });
    }
    const result = room.drawCard(socket.id);
    if (result.error) return cb?.(result);
    cb?.({ ok: true });
    broadcastRoom(socket.data.roomId);
  });

  // ── Discard drawn card ─────────────────────────────────────────────────────
  socket.on('discard-drawn-card', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    if (room.phase !== 'playing') return cb?.({ error: 'Not in playing phase' });
    if (room.currentTurnPlayerId !== socket.id) return cb?.({ error: 'Not your turn' });
    const result = room.discardDrawnCard(socket.id);
    if (result.error) return cb?.(result);
    cb?.({ ok: true });
    openPlaydown(socket.data.roomId, result.discardType, socket.id);
  });

  // ── Replace grid card ──────────────────────────────────────────────────────
  socket.on('replace-grid-card', ({ gridPosition }, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    if (room.phase !== 'playing') return cb?.({ error: 'Not in playing phase' });
    if (room.currentTurnPlayerId !== socket.id) return cb?.({ error: 'Not your turn' });
    const result = room.replaceGridCard(socket.id, gridPosition);
    if (result.error) return cb?.(result);
    cb?.({ ok: true });
    openPlaydown(socket.data.roomId, result.discardType, socket.id);
  });

  // ── Play down ──────────────────────────────────────────────────────────────
  socket.on('play-down', ({ cardOwnerId, gridPosition }, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    const result = room.attemptPlayDown(socket.id, cardOwnerId, gridPosition);
    if (result.error) return cb?.(result);

    // Track play-down stats
    const rs = roundStats.get(socket.data.roomId);
    const ps = rs?.get(socket.id);
    if (ps) {
      ps.playdownsAttempted++;
      if (result.ok) ps.playdownsSucceeded++;
      if (result.penalty) ps.penaltiesReceived++;
    }

    if (!result.ok) {
      cb?.({ ok: false, penalty: true });
      broadcastRoom(socket.data.roomId);
      return;
    }

    clearTimeout(pdTimers.get(socket.data.roomId));
    pdTimers.delete(socket.data.roomId);
    room.closePlaydownWindow();

    if (result.giveCard) {
      cb?.({ ok: true, giveCard: true });
      openGiveCard(socket.data.roomId, result.giverId, result.receiverId);
    } else {
      cb?.({ ok: true, giveCard: false });
      advanceTurnAndCheck(socket.data.roomId);
    }
  });

  // ── Give card ──────────────────────────────────────────────────────────────
  socket.on('give-card', ({ gridPosition }, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    const result = room.giveCard(socket.id, gridPosition);
    if (result.error) return cb?.(result);
    clearTimeout(gcTimers.get(socket.data.roomId));
    gcTimers.delete(socket.data.roomId);
    cb?.({ ok: true });
    advanceTurnAndCheck(socket.data.roomId);
  });

  // ── Power: decision ────────────────────────────────────────────────────────
  socket.on('power-decision', ({ use }, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    if (!room.powerWindow || room.powerWindow.phase !== 'decision') {
      return cb?.({ error: 'No power decision window open' });
    }
    if (room.powerWindow.playerId !== socket.id) return cb?.({ error: 'Not your power' });

    clearTimeout(pdecTimers.get(socket.data.roomId));
    pdecTimers.delete(socket.data.roomId);

    if (!use) {
      // Track power skipped
      const ps = roundStats.get(socket.data.roomId)?.get(socket.id);
      if (ps) ps.powersSkipped++;
      room.closePowerWindow();
      cb?.({ ok: true });
      advanceTurnAndCheck(socket.data.roomId);
      return;
    }

    // Track power used
    const ps = roundStats.get(socket.data.roomId)?.get(socket.id);
    if (ps) ps.powersUsed++;
    room.activatePowerAction();
    cb?.({ ok: true });
    broadcastRoom(socket.data.roomId);
    startPowerActionTimer(socket.data.roomId);
  });

  // ── Power: peek ────────────────────────────────────────────────────────────
  socket.on('power-peek', ({ targetPlayerId, gridPosition }, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    const result = room.powerPeek(socket.id, targetPlayerId, gridPosition);
    if (result.error) return cb?.(result);
    cb?.({ ok: true, complete: result.complete });
    broadcastRoom(socket.data.roomId);
    if (result.complete) resolvePower(socket.data.roomId);
  });

  // ── Power: swap select ─────────────────────────────────────────────────────
  socket.on('power-swap-select', ({ targetPlayerId, gridPosition }, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    const result = room.powerSwapSelect(socket.id, targetPlayerId, gridPosition);
    if (result.error) return cb?.(result);
    cb?.({ ok: true, step: result.step, complete: result.complete });
    broadcastRoom(socket.data.roomId);
    if (result.complete) resolvePower(socket.data.roomId);
  });

  // ── Power: skip remaining ──────────────────────────────────────────────────
  socket.on('power-skip', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    const result = room.powerSkipRemaining(socket.id);
    if (result.error) return cb?.(result);
    cb?.({ ok: true });
    resolvePower(socket.data.roomId);
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  socket.on('chat-message', ({ text } = {}, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    if (!socket.data.username) return cb?.({ error: 'Login required' });
    const trimmed = (text ?? '').trim().slice(0, 200);
    if (!trimmed) return cb?.({ error: 'Empty message' });
    io.to(socket.data.roomId).emit('chat-message', {
      from: socket.data.username,
      text: trimmed,
      ts: Date.now(),
    });
    cb?.({ ok: true });
  });

  // ── Generic extensible action ──────────────────────────────────────────────
  socket.on('game-action', ({ type, payload }, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb?.({ error: 'Not in a room' });
    io.to(socket.data.roomId).emit('game-action', { from: socket.id, type, payload });
    cb?.({ ok: true });
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);

    if (socket.data.userId) onlineUsers.delete(socket.data.userId);

    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.removePlayer(socket.id);
    if (room.isEmpty()) {
      for (const map of [peekTimers, pdTimers, gcTimers, pdecTimers, pactTimers]) {
        const t = map.get(roomId);
        if (t) clearTimeout(t);
        map.delete(roomId);
      }
      roundStats.delete(roomId);
      rooms.delete(roomId);
      console.log(`[room] ${roomId} deleted (empty)`);
    } else {
      broadcastRoom(roomId);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
