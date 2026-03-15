import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { AuthProxyController } from './auth-proxy.controller.js';
import type { ProxyFactory } from './proxy.factory.js';

type MockConfigService = Pick<ConfigService, 'getOrThrow'>;
type MockProxyFactory = Pick<ProxyFactory, 'getProxy'>;

describe('AuthProxyController', () => {
  let mockProxyHandler: ReturnType<typeof vi.fn>;
  let mockConfig: MockConfigService;
  let mockProxyFactory: MockProxyFactory;
  let controller: AuthProxyController;

  beforeEach(() => {
    mockProxyHandler = vi.fn();
    mockConfig = { getOrThrow: vi.fn().mockReturnValue('http://identity:3000') };
    mockProxyFactory = { getProxy: vi.fn().mockReturnValue(mockProxyHandler) };
    controller = new AuthProxyController(
      mockConfig as ConfigService,
      mockProxyFactory as ProxyFactory,
    );
  });

  const makeStubs = (headersSent = false) => ({
    req: {
      headers: {} as Record<string, string | undefined>,
    } as Partial<Request>,
    res: {
      headersSent,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as Partial<Response>,
  });

  it('reads IDENTITY_SERVICE_URL and delegates to the proxy handler', () => {
    const { req, res } = makeStubs();

    controller.proxyAuth(req as Request, res as Response);

    expect(mockConfig.getOrThrow).toHaveBeenCalledWith('IDENTITY_SERVICE_URL');
    expect(mockProxyHandler).toHaveBeenCalledOnce();
  });

  it('sends 502 with correlationId via next-callback when headers are not yet sent', () => {
    const { req, res } = makeStubs(false);
    req.headers!['x-correlation-id'] = 'corr-abc';

    controller.proxyAuth(req as Request, res as Response);

    const nextFn = mockProxyHandler.mock.calls[0]![2] as () => void;
    nextFn();

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'BAD_GATEWAY',
        correlationId: 'corr-abc',
      }),
    );
  });

  it('next-callback is a no-op when headers have already been sent', () => {
    const { req, res } = makeStubs(true);

    controller.proxyAuth(req as Request, res as Response);

    const nextFn = mockProxyHandler.mock.calls[0]![2] as () => void;
    nextFn();

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('uses "unknown" as correlationId when the x-correlation-id header is absent', () => {
    const { req, res } = makeStubs(false);

    controller.proxyAuth(req as Request, res as Response);

    const nextFn = mockProxyHandler.mock.calls[0]![2] as () => void;
    nextFn();

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'unknown' }),
    );
  });
});
