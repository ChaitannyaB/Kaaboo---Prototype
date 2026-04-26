import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Server } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { GameRoom, getPowerInfo } from './models/game-room';

interface RoundStat {
  playdownsAttempted: number;
  playdownsSucceeded: number;
  penaltiesReceived: number;
  powersUsed: number;
  powersSkipped: number;
}

function emptyRoundStat(): RoundStat {
  return { playdownsAttempted: 0, playdownsSucceeded: 0, penaltiesReceived: 0, powersUsed: 0, powersSkipped: 0 };
}

@Injectable()
export class GameService implements OnApplicationShutdown {
  // Exposed so GameGateway and UsersService can access them
  readonly rooms = new Map<string, GameRoom>();
  readonly onlineUsers = new Map<string, string>(); // userId -> socketId
  readonly roundStats = new Map<string, Map<string, RoundStat>>();
  server: Server | null = null;

  private readonly peekTimers = new Map<string, NodeJS.Timeout>();
  private readonly pdTimers = new Map<string, NodeJS.Timeout>();
  private readonly gcTimers = new Map<string, NodeJS.Timeout>();
  private readonly pdecTimers = new Map<string, NodeJS.Timeout>();
  private readonly pactTimers = new Map<string, NodeJS.Timeout>();
  private readonly turnTimers = new Map<string, NodeJS.Timeout>();
  private sweepInterval: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaService) {
    this.sweepInterval = setInterval(() => this.sweepOrphanedRooms(), 60_000);
    // Purge stale pending game invites on startup and every hour
    this.purgeStaleInvites();
    setInterval(() => this.purgeStaleInvites(), 60 * 60_000);
  }

  onApplicationShutdown() {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
    for (const [id] of this.rooms) this.cleanupRoom(id);
    if (this.server) {
      this.server.emit('server-shutdown', { message: 'Server is restarting' });
      this.server.disconnectSockets(true);
    }
  }

  private sweepOrphanedRooms() {
    const staleMs = 5 * 60_000;
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      if (room.phase === 'finished' && room.finishedAt && now - room.finishedAt > staleMs) {
        this.cleanupRoom(id);
        console.log(`[room] ${id} swept (finished > 5 min ago)`);
      }
    }
  }

  private purgeStaleInvites() {
    const cutoff = new Date(Date.now() - 10 * 60_000);
    this.prisma.gameInvite
      .deleteMany({ where: { createdAt: { lt: cutoff }, status: 'PENDING' } })
      .catch((err) => console.error('[cleanup] invite purge failed:', err));
  }

  setServer(server: Server) { this.server = server; }

  // ── Room helpers ────────────────────────────────────────────────────────────

  generateRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }

  getPublicRooms() {
    const list = [];
    for (const [id, room] of this.rooms) {
      if (room.isPublic && room.phase === 'lobby') {
        list.push({
          roomId: id,
          playerCount: room.players.length,
          maxPlayers: 8,
          host: room.players.find((p) => p.isHost)?.name ?? '?',
        });
      }
    }
    return list;
  }

  broadcastRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || !this.server) return;
    for (const p of room.players) {
      this.server.to(p.id).emit('game-state', room.getPlayerState(p.id));
    }
  }

  // ── Turn advancement ────────────────────────────────────────────────────────

  advanceTurnAndCheck(roomId: string): void {
    const r = this.rooms.get(roomId);
    if (!r || r.phase !== 'playing') {
      this.broadcastRoom(roomId);
      return;
    }
    r.nextTurn();
    if (r.kaabooCallerId && r.currentTurnPlayerId === r.kaabooCallerId) {
      r.endGame();
      console.log(`[game] ${roomId} — Kaaboo resolved (${r._kaabooCallerWon ? 'caller won' : 'caller lost'})`);
      this.flushRoundStats(roomId, r)
        .then(() => {
          if (!this.server) return;
          for (const p of r.players) {
            this.server.to(p.id).emit('stats-ready');
          }
        })
        .catch((err) => console.error('[stats] flush error:', err));
    }
    if (r?.phase === 'playing') this.startTurnTimer(roomId);
    this.broadcastRoom(roomId);
  }

  afterPlaydownClose(roomId: string): void {
    const r = this.rooms.get(roomId);
    if (!r) return;
    const ld = r._lastDiscard;
    if (ld?.wasDrawn && getPowerInfo(ld.rank)) {
      if (r.openPowerDecisionWindow(r.currentTurnPlayerId, ld.rank)) {
        this.broadcastRoom(roomId);
        this.startPowerDecisionTimer(roomId);
        return;
      }
    }
    this.advanceTurnAndCheck(roomId);
  }

  // ── Timer helpers ───────────────────────────────────────────────────────────

  openPlaydown(roomId: string, discardType: string, currentTurnPlayerId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.openPlaydownWindow(discardType, currentTurnPlayerId);
    this.broadcastRoom(roomId);

    clearTimeout(this.pdTimers.get(roomId));
    this.pdTimers.set(roomId, setTimeout(() => {
      const r = this.rooms.get(roomId);
      this.pdTimers.delete(roomId);
      if (!r?.playdownWindow) return;

      r.closePlaydownWindow();
      this.afterPlaydownClose(roomId);
      console.log(`[pd] ${roomId} window expired`);
    }, 5_000));
  }

  openGiveCard(roomId: string, giverId: string, receiverId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.openGiveCardWindow(giverId, receiverId);
    this.broadcastRoom(roomId);

    clearTimeout(this.gcTimers.get(roomId));
    this.gcTimers.set(roomId, setTimeout(() => {
      const r = this.rooms.get(roomId);
      this.gcTimers.delete(roomId);
      if (!r?.giveCardWindow) return;
      r.giveRandomCard();
      this.afterPlaydownClose(roomId);
      console.log(`[gc] ${roomId} timeout — random card given`);
    }, 5_000));
  }

  startPowerDecisionTimer(roomId: string) {
    clearTimeout(this.pdecTimers.get(roomId));
    this.pdecTimers.set(roomId, setTimeout(() => {
      const r = this.rooms.get(roomId);
      this.pdecTimers.delete(roomId);
      if (!r?.powerWindow || r.powerWindow.phase !== 'decision') return;
      const ps = this.roundStats.get(roomId)?.get(r.powerWindow.playerId);
      if (ps) ps.powersSkipped++;
      r.closePowerWindow();
      this.advanceTurnAndCheck(roomId);
      console.log(`[pow] ${roomId} decision timeout`);
    }, 5_000));
  }

  startPowerActionTimer(roomId: string) {
    clearTimeout(this.pactTimers.get(roomId));
    this.pactTimers.set(roomId, setTimeout(() => {
      const r = this.rooms.get(roomId);
      this.pactTimers.delete(roomId);
      if (!r?.powerWindow || r.powerWindow.phase !== 'action') return;
      r.closePowerWindow();
      this.advanceTurnAndCheck(roomId);
      console.log(`[pow] ${roomId} action timeout`);
    }, 20_000));
  }

  resolvePower(roomId: string) {
    clearTimeout(this.pactTimers.get(roomId));
    this.pactTimers.delete(roomId);
    const r = this.rooms.get(roomId);
    if (!r) return;
    r.closePowerWindow();
    this.advanceTurnAndCheck(roomId);
  }

  resolvePowerAfterDelay(roomId: string, delayMs: number) {
    clearTimeout(this.pactTimers.get(roomId));
    this.pactTimers.set(roomId, setTimeout(() => {
      this.pactTimers.delete(roomId);
      const r = this.rooms.get(roomId);
      if (!r?.powerWindow) return;
      r.closePowerWindow();
      this.advanceTurnAndCheck(roomId);
    }, delayMs));
  }

  clearPlaydownTimer(roomId: string) {
    clearTimeout(this.pdTimers.get(roomId));
    this.pdTimers.delete(roomId);
  }

  clearPowerDecisionTimer(roomId: string) {
    clearTimeout(this.pdecTimers.get(roomId));
    this.pdecTimers.delete(roomId);
  }

  startTurnTimer(roomId: string) {
    clearTimeout(this.turnTimers.get(roomId));
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== 'playing') return;
    room.turnEndsAt = Date.now() + 20_000;
    this.broadcastRoom(roomId);
    this.turnTimers.set(roomId, setTimeout(() => {
      const r = this.rooms.get(roomId);
      this.turnTimers.delete(roomId);
      if (!r || r.phase !== 'playing') return;
      r.turnEndsAt = null;
      r.applyAfkPenalty();
      this.broadcastRoom(roomId);
      this.advanceTurnAndCheck(roomId);
      console.log(`[turn] ${roomId} AFK timeout — penalty given`);
    }, 20_000));
  }

  clearTurnTimer(roomId: string) {
    clearTimeout(this.turnTimers.get(roomId));
    this.turnTimers.delete(roomId);
    const room = this.rooms.get(roomId);
    if (room) room.turnEndsAt = null;
  }

  async notifyFriendsPresence(userId: string, online: boolean) {
    const friendships = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    });
    for (const f of friendships) {
      const friendId = f.requesterId === userId ? f.addresseeId : f.requesterId;
      const sid = this.onlineUsers.get(friendId);
      if (sid && this.server) this.server.to(sid).emit(online ? 'friend-online' : 'friend-offline', { userId });
    }
  }

  cleanupRoom(roomId: string) {
    for (const map of [this.peekTimers, this.pdTimers, this.gcTimers, this.pdecTimers, this.pactTimers, this.turnTimers]) {
      const t = map.get(roomId);
      if (t) clearTimeout(t);
      map.delete(roomId);
    }
    this.roundStats.delete(roomId);
    this.rooms.delete(roomId);
  }

  // ── DB helpers ──────────────────────────────────────────────────────────────

  async loadScoreBoard(userId: string): Promise<number> {
    if (!userId) return 0;
    const row = await this.prisma.userStats.findUnique({
      where: { userId },
      select: { kaabooWins: true, kaabooLosses: true },
    });
    return row ? row.kaabooWins - row.kaabooLosses : 0;
  }

  async flushRoundStats(roomId: string, room: GameRoom) {
    const rs = this.roundStats.get(roomId);
    if (!rs) return;

    const eligiblePlayers = room.players.filter((p) => p.userId);

    // Fetch existing bestCardScore for all players in parallel before opening a transaction
    const existingStats = await Promise.all(
      eligiblePlayers.map((p) =>
        this.prisma.userStats.findUnique({
          where: { userId: p.userId },
          select: { bestCardScore: true },
        }),
      ),
    );

    const ops = eligiblePlayers.map((player, i) => {
      const stat = rs.get(player.id) ?? emptyRoundStat();
      const cardScore = room.calculatePlayerScore(player.id);
      const isCaller = room.kaabooCallerId === player.id;
      const existing = existingStats[i];

      let newBestScore: number | null = existing?.bestCardScore ?? null;
      if (isCaller) {
        newBestScore = newBestScore == null ? cardScore : Math.min(newBestScore, cardScore);
      }

      return this.prisma.userStats.upsert({
        where: { userId: player.userId },
        create: {
          userId: player.userId,
          roundsPlayed: 1,
          kaabooCalls: isCaller ? 1 : 0,
          kaabooWins: isCaller && room._kaabooCallerWon ? 1 : 0,
          kaabooLosses: isCaller && !room._kaabooCallerWon ? 1 : 0,
          playdownsAttempted: stat.playdownsAttempted,
          playdownsSucceeded: stat.playdownsSucceeded,
          penaltiesReceived: stat.penaltiesReceived,
          powersUsed: stat.powersUsed,
          powersSkipped: stat.powersSkipped,
          bestCardScore: isCaller ? cardScore : null,
          totalCardScore: cardScore,
        },
        update: {
          roundsPlayed: { increment: 1 },
          kaabooCalls: { increment: isCaller ? 1 : 0 },
          kaabooWins: { increment: isCaller && room._kaabooCallerWon ? 1 : 0 },
          kaabooLosses: { increment: isCaller && !room._kaabooCallerWon ? 1 : 0 },
          playdownsAttempted: { increment: stat.playdownsAttempted },
          playdownsSucceeded: { increment: stat.playdownsSucceeded },
          penaltiesReceived: { increment: stat.penaltiesReceived },
          powersUsed: { increment: stat.powersUsed },
          powersSkipped: { increment: stat.powersSkipped },
          bestCardScore: newBestScore,
          totalCardScore: { increment: cardScore },
        },
      });
    });

    // All upserts in a single transaction — partial failure rolls back everything
    await this.prisma.$transaction(ops);
    this.roundStats.delete(roomId);
    console.log(`[stats] flushed round stats for ${roomId} (${eligiblePlayers.length} players)`);
  }
}
