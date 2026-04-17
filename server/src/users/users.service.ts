import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, ConflictException, UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { GameService } from '../game/game.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private gameService: GameService,
  ) {}

  async search(query: string, currentUserId: string) {
    const q = query.trim();
    if (q.length < 2) return { users: [] };
    const users = await this.prisma.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
        NOT: { id: currentUserId },
      },
      select: { id: true, username: true },
      take: 20,
    });
    return { users };
  }

  async getFriends(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: { select: { id: true, username: true } },
        addressee: { select: { id: true, username: true } },
      },
    });

    const friends = friendships.map((f) => {
      const friend = f.requesterId === userId ? f.addressee : f.requester;
      return { friendshipId: f.id, id: friend.id, username: friend.username };
    });
    return { friends };
  }

  async getFriendRequests(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { addresseeId: userId, status: 'PENDING' },
      include: { requester: { select: { id: true, username: true } } },
    });
    const requests = rows.map((f) => ({
      id: f.id,
      userId: f.requester.id,
      username: f.requester.username,
    }));
    return { requests };
  }

  async sendFriendRequest(requesterId: string, requesterUsername: string, addresseeId: string) {
    if (addresseeId === requesterId) throw new BadRequestException('Cannot add yourself');

    const addressee = await this.prisma.user.findUnique({ where: { id: addresseeId } });
    if (!addressee) throw new NotFoundException('User not found');

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
      },
    });
    if (existing) throw new ConflictException('Friend request already exists');

    const friendship = await this.prisma.friendship.create({
      data: { requesterId, addresseeId },
    });

    const addrSocketId = this.gameService.onlineUsers.get(addresseeId);
    if (addrSocketId && this.gameService.server) {
      this.gameService.server.to(addrSocketId).emit('friend-request', {
        id: friendship.id,
        from: { id: requesterId, username: requesterUsername },
      });
    }

    return { ok: true, friendshipId: friendship.id };
  }

  async respondFriendRequest(
    friendshipId: string,
    currentUserId: string,
    currentUsername: string,
    action: 'accept' | 'decline',
  ) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new NotFoundException('Friend request not found');
    if (friendship.addresseeId !== currentUserId) throw new ForbiddenException('Not authorized');
    if (friendship.status !== 'PENDING') throw new BadRequestException('Request already handled');

    if (action === 'accept') {
      await this.prisma.friendship.update({
        where: { id: friendshipId },
        data: { status: 'ACCEPTED' },
      });
      const requesterSocketId = this.gameService.onlineUsers.get(friendship.requesterId);
      if (requesterSocketId && this.gameService.server) {
        this.gameService.server.to(requesterSocketId).emit('friend-accepted', {
          by: { id: currentUserId, username: currentUsername },
        });
      }
    } else {
      await this.prisma.friendship.delete({ where: { id: friendshipId } });
    }

    return { ok: true };
  }

  async removeFriend(friendshipId: string, currentUserId: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new NotFoundException('Friendship not found');
    if (friendship.requesterId !== currentUserId && friendship.addresseeId !== currentUserId) {
      throw new ForbiddenException('Not authorized');
    }
    if (friendship.status !== 'ACCEPTED') throw new BadRequestException('Not an accepted friendship');
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    return { ok: true };
  }

  async sendGameInvite(inviterId: string, inviterUsername: string, inviteeId: string, roomId: string) {
    if (!roomId || !inviteeId) throw new BadRequestException('roomId and inviteeId required');

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: inviterId, addresseeId: inviteeId },
          { requesterId: inviteeId, addresseeId: inviterId },
        ],
      },
    });
    if (!friendship) throw new ForbiddenException('Must be friends to invite');

    const existing = await this.prisma.gameInvite.findFirst({
      where: { roomId, inviteeId, status: 'PENDING' },
    });
    if (existing) return { ok: true, inviteId: existing.id };

    const invite = await this.prisma.gameInvite.create({
      data: { roomId, inviterId, inviteeId },
    });

    const inviteeSocketId = this.gameService.onlineUsers.get(inviteeId);
    if (inviteeSocketId && this.gameService.server) {
      this.gameService.server.to(inviteeSocketId).emit('game-invite', {
        id: invite.id,
        roomId,
        inviter: { id: inviterId, username: inviterUsername },
      });
    }

    return { ok: true, inviteId: invite.id };
  }

  async getGameInvites(userId: string) {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000);
    const rows = await this.prisma.gameInvite.findMany({
      where: { inviteeId: userId, status: 'PENDING', createdAt: { gte: cutoff } },
      include: { inviter: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const invites = rows.map((i) => ({
      id: i.id,
      roomId: i.roomId,
      inviterUsername: i.inviter.username,
      createdAt: i.createdAt.getTime(),
    }));
    return { invites };
  }

  async dismissInvite(inviteId: string, userId: string) {
    const invite = await this.prisma.gameInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.inviteeId !== userId) throw new ForbiddenException('Not authorized');
    await this.prisma.gameInvite.delete({ where: { id: inviteId } });
    return { ok: true };
  }

  async deleteAccount(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) throw new UnauthorizedException('Incorrect password');

    await this.prisma.user.delete({ where: { id: userId } });
    return { ok: true };
  }

  async getMyStats(userId: string) {
    const s = await this.prisma.userStats.findUnique({ where: { userId } });
    return { stats: this._formatStats(s) };
  }

  async getUserStats(targetId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, username: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const s = await this.prisma.userStats.findUnique({ where: { userId: targetId } });
    return {
      username: user.username,
      stats: {
        roundsPlayed: s?.roundsPlayed ?? 0,
        kaabooCalls: s?.kaabooCalls ?? 0,
        kaabooWins: s?.kaabooWins ?? 0,
        kaabooLosses: s?.kaabooLosses ?? 0,
        scoreboard: (s?.kaabooWins ?? 0) - (s?.kaabooLosses ?? 0),
        winRate: s?.kaabooCalls > 0 ? +((s.kaabooWins / s.kaabooCalls) * 100).toFixed(1) : null,
        bestCardScore: s?.bestCardScore ?? null,
      },
    };
  }

  private _formatStats(s: any) {
    const zero = {
      roundsPlayed: 0, kaabooCalls: 0, kaabooWins: 0, kaabooLosses: 0,
      playdownsAttempted: 0, playdownsSucceeded: 0, penaltiesReceived: 0,
      powersUsed: 0, powersSkipped: 0, bestCardScore: null, totalCardScore: 0,
    };
    const d = s ?? zero;
    return {
      roundsPlayed: d.roundsPlayed,
      kaabooCalls: d.kaabooCalls,
      kaabooWins: d.kaabooWins,
      kaabooLosses: d.kaabooLosses,
      scoreboard: d.kaabooWins - d.kaabooLosses,
      winRate: d.kaabooCalls > 0 ? +((d.kaabooWins / d.kaabooCalls) * 100).toFixed(1) : null,
      avgCardScore: d.roundsPlayed > 0 ? +(d.totalCardScore / d.roundsPlayed).toFixed(1) : null,
      bestCardScore: d.bestCardScore,
      playdownsAttempted: d.playdownsAttempted,
      playdownsSucceeded: d.playdownsSucceeded,
      penaltiesReceived: d.penaltiesReceived,
      playdownAccuracy: d.playdownsAttempted > 0
        ? +((d.playdownsSucceeded / d.playdownsAttempted) * 100).toFixed(1)
        : null,
      powersUsed: d.powersUsed,
      powersSkipped: d.powersSkipped,
    };
  }
}
