import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { ProxyFactory } from './proxy.factory.js';

/**
 * All JWT-protected downstream routes.
 * After JWT validation, the gateway strips any client-supplied X-Player-Id /
 * X-Username headers and re-injects them from the validated JWT payload, so
 * downstream services always receive a server-authoritative identity.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class ProxyController {
  constructor(
    private readonly config: ConfigService,
    private readonly proxyFactory: ProxyFactory,
  ) {}

  // ── Game Service ────────────────────────────────────────────────
  @All('matches{/*splat}')
  proxyGame(@Req() req: Request, @Res() res: Response): void {
    this.forwardAuthenticated('GAME_SERVICE_URL', req, res);
  }

  // ── Wallet Service ───────────────────────────────────────────────
  @All('wallet{/*splat}')
  proxyWallet(@Req() req: Request, @Res() res: Response): void {
    this.forwardAuthenticated('WALLET_SERVICE_URL', req, res);
  }

  // ── Inventory Service ────────────────────────────────────────────
  @All('inventory{/*splat}')
  proxyInventory(@Req() req: Request, @Res() res: Response): void {
    this.forwardAuthenticated('INVENTORY_SERVICE_URL', req, res);
  }

  // ── Marketplace Service ──────────────────────────────────────────
  @All('marketplace{/*splat}')
  proxyMarketplace(@Req() req: Request, @Res() res: Response): void {
    this.forwardAuthenticated('MARKETPLACE_SERVICE_URL', req, res);
  }

  // ── Leaderboard Service ──────────────────────────────────────────
  @All('leaderboard{/*splat}')
  proxyLeaderboard(@Req() req: Request, @Res() res: Response): void {
    this.forwardAuthenticated('LEADERBOARD_SERVICE_URL', req, res);
  }

  // ── Notification Service ─────────────────────────────────────────
  @All('notifications{/*splat}')
  proxyNotifications(@Req() req: Request, @Res() res: Response): void {
    this.forwardAuthenticated('NOTIFICATION_SERVICE_URL', req, res);
  }

  // ────────────────────────────────────────────────────────────────
  private forwardAuthenticated(envKey: string, req: Request, res: Response): void {
    // Strip client-supplied identity headers to prevent spoofing
    delete req.headers['x-player-id'];
    delete req.headers['x-username'];

    // Inject server-authoritative identity from the validated JWT
    const user = req.user as JwtPayload | undefined;
    if (user) {
      req.headers['x-player-id'] = user.sub;
      req.headers['x-username'] = user.username;
    }

    this.forward(envKey, req, res);
  }

  private forward(
    envKey: string,
    req: Request,
    res: Response,
  ): void {
    const target = this.config.getOrThrow<string>(envKey);
    const proxy = this.proxyFactory.getProxy(target);
    proxy(req, res, () => {
      if (!res.headersSent) {
        res.status(502).json({
          error: 'BAD_GATEWAY',
          detail: 'Upstream service did not respond.',
          correlationId: (req.headers['x-correlation-id'] as string | undefined) ?? 'unknown',
        });
      }
    });
  }
}
