import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProxyFactory } from './proxy.factory.js';

/**
 * Wildcard proxy controller — every route is JWT-protected.
 * Guards run before the controller method, so the JWT is validated
 * before the request is forwarded to the downstream service.
 *
 * Path rewriting (@see ProxyFactory): /api/matches → /matches
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class ProxyController {
  constructor(
    private readonly config: ConfigService,
    private readonly proxyFactory: ProxyFactory,
  ) {}

  // ── Game Service ────────────────────────────────────────────────
  @All('matches*splat')
  proxyGame(@Req() req: Request, @Res() res: Response): void {
    this.forward('GAME_SERVICE_URL', req, res);
  }

  // ── Wallet Service ───────────────────────────────────────────────
  @All('wallet*splat')
  proxyWallet(@Req() req: Request, @Res() res: Response): void {
    this.forward('WALLET_SERVICE_URL', req, res);
  }

  // ── Inventory Service ────────────────────────────────────────────
  @All('inventory*splat')
  proxyInventory(@Req() req: Request, @Res() res: Response): void {
    this.forward('INVENTORY_SERVICE_URL', req, res);
  }

  // ── Marketplace Service ──────────────────────────────────────────
  @All('marketplace*splat')
  proxyMarketplace(@Req() req: Request, @Res() res: Response): void {
    this.forward('MARKETPLACE_SERVICE_URL', req, res);
  }

  // ── Leaderboard Service ──────────────────────────────────────────
  @All('leaderboard*splat')
  proxyLeaderboard(@Req() req: Request, @Res() res: Response): void {
    this.forward('LEADERBOARD_SERVICE_URL', req, res);
  }

  // ── Notification Service ─────────────────────────────────────────
  @All('notifications*splat')
  proxyNotifications(@Req() req: Request, @Res() res: Response): void {
    this.forward('NOTIFICATION_SERVICE_URL', req, res);
  }

  // ────────────────────────────────────────────────────────────────
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
