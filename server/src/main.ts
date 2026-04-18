import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

class SocketIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      pingInterval: 10000,
      pingTimeout: 5000,
      upgradeTimeout: 10000,
      transports: ['websocket', 'polling'],
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.CLIENT_URL || '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useWebSocketAdapter(new SocketIoAdapter(app));
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Server on http://localhost:${port}`);
}
bootstrap();
