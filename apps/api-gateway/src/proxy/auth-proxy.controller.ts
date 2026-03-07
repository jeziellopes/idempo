import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ProxyFactory } from './proxy.factory.js';

/**
 * Public pass-through for identity-service routes.
 * No JwtAuthGuard — the identity-service owns its own auth flow
 * (GitHub OAuth callbacks, refresh, logout, me).
 */
@Controller('auth')
export class AuthProxyController {
  constructor(
    private readonly config: ConfigService,
    private readonly proxyFactory: ProxyFactory,
  ) {}

  @All('{/*splat}')
  proxyAuth(@Req() req: Request, @Res() res: Response): void {
    const target = this.config.getOrThrow<string>('IDENTITY_SERVICE_URL');
    const proxy = this.proxyFactory.getProxy(target);
    proxy(req, res, () => {
      if (!res.headersSent) {
        res.status(502).json({
          error: 'BAD_GATEWAY',
          detail: 'Identity service did not respond.',
          correlationId: (req.headers['x-correlation-id'] as string | undefined) ?? 'unknown',
        });
      }
    });
  }
}
