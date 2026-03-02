import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { ProxyModule } from './proxy/proxy.module.js';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware.js';
import { envValidationSchema } from './config/env.validation.js';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';

@Module({
  imports: [
    // Env validation — startup fails if JWT_SECRET (or other required vars) is absent
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    // Rate limiting: 60 requests / 60 s per IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    AuthModule,
    HealthModule,
    ProxyModule,
  ],
  providers: [
    // Register ThrottlerGuard globally so rate limiting is actually enforced
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
