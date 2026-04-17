import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, Req, HttpCode,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('api/users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  search(@Query('q') q = '', @Req() req: Request) {
    return this.usersService.search(q, (req.user as any).userId);
  }

  @Get('friends')
  getFriends(@Req() req: Request) {
    return this.usersService.getFriends((req.user as any).userId);
  }

  @Get('friends/requests')
  getFriendRequests(@Req() req: Request) {
    return this.usersService.getFriendRequests((req.user as any).userId);
  }

  @Post('friends/request')
  sendFriendRequest(@Body('addresseeId') addresseeId: string, @Req() req: Request) {
    const { userId, username } = req.user as any;
    return this.usersService.sendFriendRequest(userId, username, addresseeId);
  }

  @Put('friends/:id')
  respondFriendRequest(
    @Param('id') id: string,
    @Body('action') action: 'accept' | 'decline',
    @Req() req: Request,
  ) {
    const { userId, username } = req.user as any;
    return this.usersService.respondFriendRequest(id, userId, username, action);
  }

  @Delete('friends/:id')
  removeFriend(@Param('id') id: string, @Req() req: Request) {
    return this.usersService.removeFriend(id, (req.user as any).userId);
  }

  @Post('invites')
  sendGameInvite(@Body() body: { roomId: string; inviteeId: string }, @Req() req: Request) {
    const { userId, username } = req.user as any;
    return this.usersService.sendGameInvite(userId, username, body.inviteeId, body.roomId);
  }

  @Get('invites')
  getGameInvites(@Req() req: Request) {
    return this.usersService.getGameInvites((req.user as any).userId);
  }

  @Delete('invites/:id')
  @HttpCode(200)
  dismissInvite(@Param('id') id: string, @Req() req: Request) {
    return this.usersService.dismissInvite(id, (req.user as any).userId);
  }

  @Get('me/stats')
  getMyStats(@Req() req: Request) {
    return this.usersService.getMyStats((req.user as any).userId);
  }

  @Delete('me')
  @HttpCode(200)
  deleteAccount(@Body('password') password: string, @Req() req: Request) {
    return this.usersService.deleteAccount((req.user as any).userId, password);
  }

  @Get(':id/stats')
  getUserStats(@Param('id') id: string) {
    return this.usersService.getUserStats(id);
  }
}
