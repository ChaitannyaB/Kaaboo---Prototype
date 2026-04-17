import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { GameModule } from '../game/game.module';

@Module({
  imports: [GameModule],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
