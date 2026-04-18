import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect,
  ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { GameService } from './game.service';
import { GameRoom } from './models/game-room';

@WebSocketGateway({ cors: { origin: '*', methods: ['GET', 'POST'] }, transports: ['websocket', 'polling'] })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly gameService: GameService) {}

  afterInit(server: Server) {
    this.gameService.setServer(server);
    const jwtSecret = process.env.JWT_SECRET || 'kaaboo-dev-secret-change-in-prod';
    server.use((socket: Socket, next) => {
      const token = socket.handshake.auth?.token;
      if (token) {
        try {
          const decoded = jwt.verify(token, jwtSecret) as any;
          socket.data.userId = decoded.userId;
          socket.data.username = decoded.username;
        } catch { /* unauthenticated — allowed */ }
      }
      next();
    });
  }

  handleConnection(socket: Socket) {
    console.log(`[+] ${socket.id}`);
    if (socket.data.userId) {
      this.gameService.onlineUsers.set(socket.data.userId, socket.id);
      socket.emit('me', { userId: socket.data.userId, username: socket.data.username });
      this.gameService.notifyFriendsPresence(socket.data.userId, true).catch(() => {});
    }
  }

  handleDisconnect(socket: Socket) {
    console.log(`[-] ${socket.id} reason=${(socket as any).disconnectReason ?? 'unknown'}`);
    if (socket.data.userId) {
      this.gameService.notifyFriendsPresence(socket.data.userId, false).catch(() => {});
      this.gameService.onlineUsers.delete(socket.data.userId);
    }

    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = this.gameService.rooms.get(roomId);
    if (!room) return;

    room.removePlayer(socket.id);
    if (room.isEmpty()) {
      this.gameService.cleanupRoom(roomId);
      console.log(`[room] ${roomId} deleted (empty)`);
    } else {
      this.gameService.broadcastRoom(roomId);
    }
  }

  // ── Room management ─────────────────────────────────────────────────────────

  @SubscribeMessage('create-room')
  async handleCreateRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { isPublic?: boolean } = {},
  ) {
    if (!socket.data.userId) return { error: 'Login required' };

    const scoreBoard = await this.gameService.loadScoreBoard(socket.data.userId);
    const isPublic = data?.isPublic !== false;
    let roomId: string;
    do { roomId = this.gameService.generateRoomId(); } while (this.gameService.rooms.has(roomId));

    const room = new GameRoom(roomId, socket.id, socket.data.username, socket.data.userId, scoreBoard, isPublic);
    this.gameService.rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;
    console.log(`[room] ${roomId} created by ${socket.data.username} (${isPublic ? 'public' : 'private'})`);
    this.gameService.broadcastRoom(roomId);
    return { roomId };
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    if (!socket.data.userId) return { error: 'Login required' };
    const id = data?.roomId?.toUpperCase();
    const room = this.gameService.rooms.get(id);
    if (!room) return { error: 'Room not found' };

    const scoreBoard = await this.gameService.loadScoreBoard(socket.data.userId);
    const result = room.addPlayer(socket.id, socket.data.username, false, socket.data.userId, scoreBoard);
    if (result.error) return result;

    socket.join(id);
    socket.data.roomId = id;
    console.log(`[room] ${socket.data.username} joined ${id}`);
    this.gameService.broadcastRoom(id);
    return { ok: true };
  }

  @SubscribeMessage('set-room-visibility')
  handleSetRoomVisibility(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { isPublic: boolean },
  ) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    const player = room.players.find((p) => p.id === socket.id);
    if (!player?.isHost) return { error: 'Only the host can change visibility' };
    if (room.phase !== 'lobby') return { error: 'Cannot change visibility after game starts' };
    room.isPublic = Boolean(data?.isPublic);
    this.gameService.broadcastRoom(socket.data.roomId);
    return { ok: true };
  }

  @SubscribeMessage('start-game')
  handleStartGame(@ConnectedSocket() socket: Socket) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    const player = room.players.find((p) => p.id === socket.id);
    if (!player?.isHost) return { error: 'Only the host can start' };

    const result = room.startGame();
    if (result.error) return result;

    const rsMap = new Map<string, any>();
    for (const p of room.players) rsMap.set(p.id, { playdownsAttempted: 0, playdownsSucceeded: 0, penaltiesReceived: 0, powersUsed: 0, powersSkipped: 0 });
    this.gameService.roundStats.set(socket.data.roomId, rsMap);

    console.log(`[game] ${socket.data.roomId} started (round ${room.roundNumber})`);
    this.gameService.broadcastRoom(socket.data.roomId);

    const roomId = socket.data.roomId;
    const dealMs = (4 * room.players.length - 1) * 55 + 820;
    setTimeout(() => {
      const r = this.gameService.rooms.get(roomId);
      if (r?.phase !== 'dealing') return;
      r.startPeek();
      this.gameService.broadcastRoom(roomId);
      setTimeout(() => {
        const r2 = this.gameService.rooms.get(roomId);
        if (r2?.phase === 'peek') { r2.endPeek(); this.gameService.broadcastRoom(roomId); }
      }, 10_000);
    }, dealMs);

    return { ok: true };
  }

  // ── Game actions ─────────────────────────────────────────────────────────────

  @SubscribeMessage('call-kaaboo')
  handleCallKaaboo(@ConnectedSocket() socket: Socket) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    const result = room.callKaaboo(socket.id);
    if (result.error) return result;
    console.log(`[kaaboo] ${socket.id} called Kaaboo in ${socket.data.roomId}`);
    this.gameService.advanceTurnAndCheck(socket.data.roomId);
    return { ok: true };
  }

  @SubscribeMessage('draw-card')
  handleDrawCard(@ConnectedSocket() socket: Socket) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    if (room.phase !== 'playing') return { error: 'Not in playing phase' };
    if (room.currentTurnPlayerId !== socket.id) return { error: 'Not your turn' };
    if (room.playdownWindow || room.giveCardWindow || room.powerWindow) return { error: 'Cannot draw right now' };
    const result = room.drawCard(socket.id);
    if (result.error) return result;
    this.gameService.broadcastRoom(socket.data.roomId);
    return { ok: true };
  }

  @SubscribeMessage('discard-drawn-card')
  handleDiscardDrawnCard(@ConnectedSocket() socket: Socket) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    if (room.phase !== 'playing') return { error: 'Not in playing phase' };
    if (room.currentTurnPlayerId !== socket.id) return { error: 'Not your turn' };
    const result = room.discardDrawnCard(socket.id);
    if (result.error) return result;
    this.gameService.openPlaydown(socket.data.roomId, result.discardType, socket.id);
    return { ok: true };
  }

  @SubscribeMessage('replace-grid-card')
  handleReplaceGridCard(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { gridPosition: string },
  ) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    if (room.phase !== 'playing') return { error: 'Not in playing phase' };
    if (room.currentTurnPlayerId !== socket.id) return { error: 'Not your turn' };
    const result = room.replaceGridCard(socket.id, data?.gridPosition);
    if (result.error) return result;
    this.gameService.openPlaydown(socket.data.roomId, result.discardType, socket.id);
    return { ok: true };
  }

  @SubscribeMessage('play-down')
  handlePlayDown(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { cardOwnerId: string; gridPosition: string },
  ) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    const result = room.attemptPlayDown(socket.id, data?.cardOwnerId, data?.gridPosition);
    if (result.error) return result;

    const rs = this.gameService.roundStats.get(socket.data.roomId);
    const ps = rs?.get(socket.id);
    if (ps) {
      ps.playdownsAttempted++;
      if (result.ok) ps.playdownsSucceeded++;
      if (result.penalty) ps.penaltiesReceived++;
    }

    if (!result.ok) {
      this.gameService.broadcastRoom(socket.data.roomId);
      return { ok: false, penalty: true };
    }

    // Clear the pd timer — play-down was claimed
    this.gameService.clearPlaydownTimer(socket.data.roomId);
    room.closePlaydownWindow();

    if (result.giveCard) {
      this.gameService.openGiveCard(socket.data.roomId, result.giverId, result.receiverId);
      return { ok: true, giveCard: true };
    }

    this.gameService.advanceTurnAndCheck(socket.data.roomId);
    return { ok: true, giveCard: false };
  }

  @SubscribeMessage('give-card')
  handleGiveCard(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { gridPosition: string },
  ) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    const result = room.giveCard(socket.id, data?.gridPosition);
    if (result.error) return result;
    this.gameService.advanceTurnAndCheck(socket.data.roomId);
    return { ok: true };
  }

  // ── Power events ─────────────────────────────────────────────────────────────

  @SubscribeMessage('power-decision')
  handlePowerDecision(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { use: boolean },
  ) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    if (!room.powerWindow || room.powerWindow.phase !== 'decision') return { error: 'No power decision window open' };
    if (room.powerWindow.playerId !== socket.id) return { error: 'Not your power' };

    this.gameService.clearPowerDecisionTimer(socket.data.roomId);

    if (!data?.use) {
      const ps = this.gameService.roundStats.get(socket.data.roomId)?.get(socket.id);
      if (ps) ps.powersSkipped++;
      room.closePowerWindow();
      this.gameService.advanceTurnAndCheck(socket.data.roomId);
      return { ok: true };
    }

    const ps = this.gameService.roundStats.get(socket.data.roomId)?.get(socket.id);
    if (ps) ps.powersUsed++;
    room.activatePowerAction();
    this.gameService.broadcastRoom(socket.data.roomId);
    this.gameService.startPowerActionTimer(socket.data.roomId);
    return { ok: true };
  }

  @SubscribeMessage('power-peek')
  handlePowerPeek(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { targetPlayerId: string; gridPosition: string },
  ) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    const result = room.powerPeek(socket.id, data?.targetPlayerId, data?.gridPosition);
    if (result.error) return result;
    this.gameService.broadcastRoom(socket.data.roomId);
    if (result.complete) this.gameService.resolvePower(socket.data.roomId);
    return { ok: true, complete: result.complete };
  }

  @SubscribeMessage('power-swap-select')
  handlePowerSwapSelect(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { targetPlayerId: string; gridPosition: string },
  ) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    const result = room.powerSwapSelect(socket.id, data?.targetPlayerId, data?.gridPosition);
    if (result.error) return result;
    this.gameService.broadcastRoom(socket.data.roomId);
    if (result.complete) this.gameService.resolvePower(socket.data.roomId);
    return { ok: true, step: result.step, complete: result.complete };
  }

  @SubscribeMessage('power-skip')
  handlePowerSkip(@ConnectedSocket() socket: Socket) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    const result = room.powerSkipRemaining(socket.id);
    if (result.error) return result;
    this.gameService.resolvePower(socket.data.roomId);
    return { ok: true };
  }

  // ── Chat + generic ───────────────────────────────────────────────────────────

  @SubscribeMessage('chat-message')
  handleChatMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { text?: string },
  ) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    if (!socket.data.username) return { error: 'Login required' };
    const trimmed = ((data?.text) ?? '').trim().slice(0, 200);
    if (!trimmed) return { error: 'Empty message' };
    this.server.to(socket.data.roomId).emit('chat-message', {
      from: socket.data.username,
      text: trimmed,
      ts: Date.now(),
    });
    return { ok: true };
  }

  @SubscribeMessage('game-action')
  handleGameAction(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { type: string; payload: any },
  ) {
    const room = this.gameService.rooms.get(socket.data.roomId);
    if (!room) return { error: 'Not in a room' };
    this.server.to(socket.data.roomId).emit('game-action', { from: socket.id, type: data?.type, payload: data?.payload });
    return { ok: true };
  }
}
