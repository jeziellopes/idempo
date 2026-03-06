import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

// Prevent passport from running real strategy logic when jwt-auth.guard is imported
vi.mock('@nestjs/passport', () => ({
  AuthGuard: vi.fn().mockImplementation(() =>
    class {
      canActivate() {
        return true;
      }
    },
  ),
}));

import { ProxyController } from './proxy.controller.js';
import type { ProxyFactory } from './proxy.factory.js';

type MockConfigService = Pick<ConfigService, 'getOrThrow'>;
type MockProxyFactory = Pick<ProxyFactory, 'getProxy'>;

describe('ProxyController', () => {
  let mockProxyHandler: ReturnType<typeof vi.fn>;
  let mockConfig: MockConfigService;
  let mockProxyFactory: MockProxyFactory;
  let controller: ProxyController;

  beforeEach(() => {
    mockProxyHandler = vi.fn();
    mockConfig = { getOrThrow: vi.fn().mockReturnValue('http://service:3000') };
    mockProxyFactory = { getProxy: vi.fn().mockReturnValue(mockProxyHandler) };
    controller = new ProxyController(mockConfig as ConfigService, mockProxyFactory as ProxyFactory);
  });

  // Helper: build lightweight req/res stubs
  const makeStubs = (headersSent = false) => ({
    req: { headers: {} as Record<string, string | undefined> } as Partial<Request>,
    res: {
      headersSent,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as Partial<Response>,
  });

  // ── Individual proxy methods ────────────────────────────────────────────────

  it.each([
    ['proxyGame', 'GAME_SERVICE_URL'],
    ['proxyWallet', 'WALLET_SERVICE_URL'],
    ['proxyInventory', 'INVENTORY_SERVICE_URL'],
    ['proxyMarketplace', 'MARKETPLACE_SERVICE_URL'],
    ['proxyLeaderboard', 'LEADERBOARD_SERVICE_URL'],
    ['proxyNotifications', 'NOTIFICATION_SERVICE_URL'],
  ] as const)('%s() reads the correct env key and calls the proxy handler', (method, envKey) => {
    const { req, res } = makeStubs();

    (controller as Record<string, (req: unknown, res: unknown) => void>)[method](req, res);

    expect(mockConfig.getOrThrow).toHaveBeenCalledWith(envKey);
    expect(mockProxyHandler).toHaveBeenCalledOnce();
  });

  // ── forward() — next callback branches ─────────────────────────────────────

  it('the next-callback sends 502 with correlationId when headers are not yet sent', () => {
    const { req, res } = makeStubs(false);
    req.headers['x-correlation-id'] = 'corr-123';

    controller.proxyGame(req, res);

    // Trigger the next() callback that forward() passes to the proxy handler
    const nextFn = mockProxyHandler.mock.calls[0]![2] as () => void;
    nextFn();

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'BAD_GATEWAY',
        correlationId: 'corr-123',
      }),
    );
  });

  it('the next-callback is a no-op when headers have already been sent', () => {
    const { req, res } = makeStubs(true);

    controller.proxyGame(req, res);

    const nextFn = mockProxyHandler.mock.calls[0]![2] as () => void;
    nextFn();

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('uses "unknown" as correlationId when the x-correlation-id header is absent', () => {
    const { req, res } = makeStubs(false);

    controller.proxyGame(req, res);

    const nextFn = mockProxyHandler.mock.calls[0]![2] as () => void;
    nextFn();

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'unknown' }));
  });

  // ── Identity header injection ───────────────────────────────────────────────

  it('injects X-Player-Id and X-Username from JWT user onto the request before proxying', () => {
    const { req, res } = makeStubs();
    (req as Request & { user: unknown }).user = {
      sub: 'a1b2c3d4-0000-0000-0000-000000000001',
      username: 'alice',
    };

    controller.proxyGame(req, res);

    expect(req.headers['x-player-id']).toBe('a1b2c3d4-0000-0000-0000-000000000001');
    expect(req.headers['x-username']).toBe('alice');
  });

  it('strips any client-supplied X-Player-Id / X-Username before injecting from JWT', () => {
    const { req, res } = makeStubs();
    req.headers['x-player-id'] = 'attacker-id';
    req.headers['x-username'] = 'attacker';
    (req as Request & { user: unknown }).user = {
      sub: 'real-player-uuid',
      username: 'real-user',
    };

    controller.proxyGame(req, res);

    // Injected values come from JWT, not from the original request headers
    expect(req.headers['x-player-id']).toBe('real-player-uuid');
    expect(req.headers['x-username']).toBe('real-user');
  });

  it('still forwards when req.user is absent (guard not yet validated — should not occur in normal flow)', () => {
    const { req, res } = makeStubs();
    req.headers['x-player-id'] = 'spoofed';

    controller.proxyGame(req, res);

    // Spoofed header deleted; no injection since no user
    expect(req.headers['x-player-id']).toBeUndefined();
    expect(mockProxyHandler).toHaveBeenCalledOnce();
  });
});
