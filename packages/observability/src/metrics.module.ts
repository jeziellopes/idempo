import { Controller, Get, Module } from '@nestjs/common';
import { register, collectDefaultMetrics } from 'prom-client';

/**
 * Call once at application bootstrap to register default Node.js process metrics.
 * Returns the prom-client registry so callers can serve its output without
 * importing prom-client directly.
 */
export function setupMetrics(): typeof register {
  collectDefaultMetrics();
  return register;
}

@Controller()
class MetricsController {
  @Get('metrics')
  async metrics(): Promise<string> {
    return register.metrics();
  }
}

/**
 * NestJS module that exposes GET /metrics on the main app port.
 *
 * ⚠️  Do NOT import this in production services that are externally reachable.
 * Instead, call setupMetrics() and serve the register on a private port
 * (e.g. 9091 bound to 127.0.0.1). See apps/api-gateway/src/main.ts for the
 * recommended pattern.
 */
@Module({
  controllers: [MetricsController],
})
export class MetricsModule {}
