// OTel must be initialised before any other imports
import { initTelemetry, shutdownTelemetry } from '@idempo/observability';
initTelemetry({ serviceName: 'game-service', serviceVersion: '0.0.0' });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { getLogger } from '@idempo/observability';

const logger = getLogger('main');
const PORT = Number(process.env['PORT'] ?? 3002);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3000' });

  await app.listen(PORT);
  logger.info({ port: PORT }, 'Game Service listening');
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Game Service failed to start');
  shutdownTelemetry().finally(() => process.exit(1));
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  await shutdownTelemetry();
  process.exit(0);
});
