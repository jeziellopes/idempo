import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('ProxyController', () => {
  let mockProxyHandler: ReturnType<typeof vi.fn>;
  let mockConfig: { getOrThrow: ReturnType<typeof vi.fn> };
  let mockProxyFactory: { getProxy: ReturnType<typeof vi.fn> };
  let controller: ProxyController;

  beforeEach(() => {
    mockProxyHandler = vi.fn();
    mockConfig = { getOrThrow: vi.fn().mockReturnValue('http://service:3000') };
    mockProxyFactory = { getProxy: vi.fn().mockReturnValue(mockProxyHandler) };
    controller = new ProxyController(mockConfig as any, mockProxyFactory as any);
  });

  // Helper: build lightweight req/res stubs
  const makeStubs = (headersSent = false) => ({
    req: { headers: {} as Record<string, string | undefined> } as any,
    res: {
      headersSent,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any,
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

    (controller as any)[method](req, res);

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
});
