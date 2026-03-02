import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { CorrelationIdMiddleware, CORRELATION_ID_HEADER } from './correlation-id.middleware.js';

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function makeRes(): { setHeader: ReturnType<typeof vi.fn>; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
  };
}

describe('CorrelationIdMiddleware', () => {
  const middleware = new CorrelationIdMiddleware();
  const next: NextFunction = vi.fn();

  it('generates a UUID when no correlation ID header is present', () => {
    const req = makeReq();
    const res = makeRes();
    middleware.use(req, res as unknown as Response, next);

    const id = req.headers[CORRELATION_ID_HEADER] as string;
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('forwards an existing correlation ID from the request', () => {
    const existingId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const req = makeReq({ [CORRELATION_ID_HEADER]: existingId });
    const res = makeRes();
    middleware.use(req, res as unknown as Response, next);

    expect(req.headers[CORRELATION_ID_HEADER]).toBe(existingId);
  });

  it('sets the correlation ID on the response header', () => {
    const req = makeReq();
    const res = makeRes();
    middleware.use(req, res as unknown as Response, next);

    const reqId = req.headers[CORRELATION_ID_HEADER] as string;
    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, reqId);
  });

  it('calls next()', () => {
    const req = makeReq();
    const res = makeRes();
    const nextFn = vi.fn();
    middleware.use(req, res as unknown as Response, nextFn);
    expect(nextFn).toHaveBeenCalledOnce();
  });
});
