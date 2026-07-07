import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logger/app-logger.service';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  const logger = app.get(AppLoggerService);
  app.useLogger(logger);

  app.use(requestIdMiddleware);
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.enableCors({
    origin: config.get<string>('api.corsOrigin'),
    credentials: true,
  });

  const port = config.get<number>('api.port') ?? 3000;
  await app.listen(port);

  logger.log(`Sheet Server running on http://localhost:${port}`, 'Bootstrap');
  logger.log(`Health check: http://localhost:${port}/api/v1/health`, 'Bootstrap');
}

bootstrap();
