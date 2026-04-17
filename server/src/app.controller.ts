import { Controller, Get } from '@nestjs/common';
import { GameService } from './game/game.service';

@Controller()
export class AppController {
  constructor(private readonly gameService: GameService) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('api/rooms')
  getRooms() {
    return { rooms: this.gameService.getPublicRooms() };
  }
}
