import { Injectable } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Request, Response, NextFunction } from 'express';

type ProxyHandler = (req: Request, res: Response, next: NextFunction) => void;

/**
 * Holds pre-created http-proxy-middleware instances, one per downstream service.
 * Instances are created lazily and cached for the process lifetime.
 */
@Injectable()
export class ProxyFactory {
  private readonly proxies = new Map<string, ProxyHandler>();

  getProxy(target: string): ProxyHandler {
    if (!this.proxies.has(target)) {
      const proxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        // Strip the NestJS global prefix so downstream services see /matches, not /api/matches
        pathRewrite: { '^/api': '' },
        on: {
          error: (err, _req, res) => {
            console.error({ err, target }, 'Proxy error');
            const expressRes = res as Response;
            if (!expressRes.headersSent) {
              expressRes.status(502).json({
                error: 'BAD_GATEWAY',
                detail: `Upstream service at ${target} is unavailable.`,
                correlationId: 'unknown',
              });
            }
          },
        },
      }) as unknown as ProxyHandler;
      this.proxies.set(target, proxy);
    }
    return this.proxies.get(target)!;
  }
}
