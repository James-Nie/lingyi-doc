import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { WsAdapter } from '@nestjs/platform-ws';
import compression from 'compression';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logger';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  app.useWebSocketAdapter(new WsAdapter(app));
  const config = app.get(ConfigService);
  const logger = app.get(AppLoggerService);
  app.useLogger(logger);

  app.use(requestIdMiddleware);
  // 大 JSON 文档响应 gzip，降低出网体积（by-path / GET docs 等）
  app.use(compression({ threshold: 1024 }));
  app.use(json({ limit: '100mb' }));
  app.use(urlencoded({ extended: true, limit: '100mb' }));

  app.enableCors({
    origin: config.get<string>('api.corsOrigin'),
    credentials: true,
  });

  const port = config.get<number>('api.port') ?? 3000;
  await app.listen(port);

  logger.logStartupConfig();
  logger.log(`Sheet Server running on http://localhost:${port}`, 'Bootstrap');
  logger.log(`Health check: http://localhost:${port}/api/v1/health`, 'Bootstrap');
  if (config.get<boolean>('collab.enabled')) {
    logger.log(`Collab WebSocket: ws://localhost:${port}/api/v1/collab/ws`, 'Bootstrap');
  }
}

bootstrap();
