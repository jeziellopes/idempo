// OTel must be initialised before any other imports
import { initTelemetry, shutdownTelemetry } from '@idempo/observability';
initTelemetry({ serviceName: 'identity-service', serviceVersion: '0.0.0' });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { getLogger } from '@idempo/observability';
import cookieParser from 'cookie-parser';

const logger = getLogger('main');
const PORT = Number(process.env['PORT'] ?? 3010);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: process.env['WEB_REDIRECT_URL'] ?? 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(PORT);
  logger.info({ port: PORT }, 'Identity Service listening');
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Identity Service failed to start');
  shutdownTelemetry().finally(() => process.exit(1));
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  await shutdownTelemetry();
  process.exit(0);
});
