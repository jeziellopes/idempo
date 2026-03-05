// OTel must be initialised before any other imports
import { initTelemetry, shutdownTelemetry } from '@idempo/observability';
initTelemetry({ serviceName: 'combat-service', serviceVersion: '0.0.0' });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { getLogger } from '@idempo/observability';

const logger = getLogger('main');
const PORT = Number(process.env['PORT'] ?? 3003);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('api');
  await app.listen(PORT);
  logger.info({ port: PORT }, 'Combat Service listening');
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Combat Service failed to start');
  shutdownTelemetry().finally(() => process.exit(1));
});

process.on('SIGTERM', async () => {
  await shutdownTelemetry();
  process.exit(0);
});
