import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockProxyMiddleware, mockCreateProxyMiddleware } = vi.hoisted(() => {
  const mockProxyMiddleware = vi.fn();
  const mockCreateProxyMiddleware = vi.fn().mockReturnValue(mockProxyMiddleware);
  return { mockProxyMiddleware, mockCreateProxyMiddleware };
});

vi.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: mockCreateProxyMiddleware,
}));

import { ProxyFactory } from './proxy.factory.js';

describe('ProxyFactory', () => {
  let factory: ProxyFactory;

  beforeEach(() => {
    vi.clearAllMocks();
    factory = new ProxyFactory();
  });

  it('creates a proxy middleware handler for the given target', () => {
    const handler = factory.getProxy('http://game-service:3002');

    expect(mockCreateProxyMiddleware).toHaveBeenCalledOnce();
    expect(handler).toBe(mockProxyMiddleware);
  });

  it('returns the cached handler on subsequent calls for the same target', () => {
    const first = factory.getProxy('http://game-service:3002');
    const second = factory.getProxy('http://game-service:3002');

    expect(mockCreateProxyMiddleware).toHaveBeenCalledOnce();
    expect(first).toBe(second);
  });

  it('creates separate handlers for different targets', () => {
    factory.getProxy('http://game-service:3002');
    factory.getProxy('http://leaderboard-service:3006');

    expect(mockCreateProxyMiddleware).toHaveBeenCalledTimes(2);
  });

  it('the error handler sends 502 BAD_GATEWAY when headers have not been sent', () => {
    factory.getProxy('http://game-service:3002');

    const opts = mockCreateProxyMiddleware.mock.calls[0]![0] as any;
    const mockRes = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    opts.on.error(new Error('ECONNREFUSED'), {}, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(502);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'BAD_GATEWAY',
        detail: expect.stringContaining('http://game-service:3002'),
      }),
    );
  });

  it('the error handler is a no-op when headers have already been sent', () => {
    factory.getProxy('http://game-service:3002');

    const opts = mockCreateProxyMiddleware.mock.calls[0]![0] as any;
    const mockRes = { headersSent: true, status: vi.fn(), json: vi.fn() } as any;

    opts.on.error(new Error('already flushed'), {}, mockRes);

    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
  });
});
