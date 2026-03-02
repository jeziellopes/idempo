// OTel must be initialised before any other imports
import { initTelemetry, shutdownTelemetry, setupMetrics } from '@idempo/observability';
initTelemetry({ serviceName: 'api-gateway', serviceVersion: '0.0.0' });
const register = setupMetrics();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { getLogger } from '@idempo/observability';
import http from 'node:http';

const logger = getLogger('main');
const PORT = Number(process.env['PORT'] ?? 3001);
const METRICS_PORT = Number(process.env['METRICS_PORT'] ?? 9091);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3000' });

  // Input validation — rejects unknown fields and returns structured 400 errors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Normalise all errors to { error, detail, correlationId }
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(PORT);
  logger.info({ port: PORT }, 'API Gateway listening');

  // Expose Prometheus metrics on a separate internal port — never reachable from outside
  const metricsServer = http.createServer(async (_req, res) => {
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
  metricsServer.listen(METRICS_PORT, '127.0.0.1', () => {
    logger.info({ port: METRICS_PORT }, 'Metrics server listening (internal only)');
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'API Gateway failed to start');
  shutdownTelemetry().finally(() => process.exit(1));
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  await shutdownTelemetry();
  process.exit(0);
});
