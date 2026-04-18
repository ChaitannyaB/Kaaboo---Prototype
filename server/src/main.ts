import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import helmet from 'helmet';

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

function validateEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.CLIENT_URL) throw new Error('CLIENT_URL must be set in production');
    if (process.env.JWT_SECRET!.includes('dev')) {
      throw new Error('Refusing to start: dev JWT_SECRET detected in production');
    }
  }
}

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  const allowedOrigin = process.env.CLIENT_URL ?? 'http://localhost:5173';
  app.enableCors({ origin: allowedOrigin, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useWebSocketAdapter(new SocketIoAdapter(app));
  app.enableShutdownHooks();
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Server on http://localhost:${port}`);
}
bootstrap();
