import { Injectable } from '@nestjs/common';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
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
        // No pathRewrite: upstream services all use setGlobalPrefix('api') and
        // therefore expect to receive paths like /api/matches, /api/leaderboard, etc.
        on: {
          // NestJS body-parser drains req stream into req.body before this middleware
          // runs. fixRequestBody re-streams req.body to the upstream proxy request so
          // that POST/PUT bodies are not silently dropped.
          proxyReq: fixRequestBody,
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
