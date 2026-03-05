import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter, type ErrorBody } from './global-exception.filter.js';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware.js';

const CORRELATION_ID = 'test-correlation-id';

function makeHost(statusFn = vi.fn(), jsonFn = vi.fn(), headers: Record<string, string> = {}): ArgumentsHost {
  const req = { headers: { [CORRELATION_ID_HEADER]: CORRELATION_ID, ...headers } };
  const res = {
    headersSent: false,
    status: vi.fn().mockReturnValue({ json: jsonFn }),
  };
  // Make status().json() return what jsonFn returns
  res.status.mockReturnValue({ json: jsonFn });
  void statusFn;
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let jsonFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    jsonFn = vi.fn();
  });

  it('maps HttpException to the correct error shape', () => {
    const host = makeHost(vi.fn(), jsonFn);
    filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), host);
    expect(jsonFn).toHaveBeenCalledWith<[ErrorBody]>({
      error: 'NOT_FOUND',
      detail: 'Not found',
      correlationId: CORRELATION_ID,
    });
  });

  it('maps 401 to UNAUTHORIZED', () => {
    const host = makeHost(vi.fn(), jsonFn);
    filter.catch(new HttpException('Missing token', HttpStatus.UNAUTHORIZED), host);
    expect(jsonFn).toHaveBeenCalledWith(expect.objectContaining({ error: 'UNAUTHORIZED' }));
  });

  it('maps 503 to SERVICE_UNAVAILABLE', () => {
    const host = makeHost(vi.fn(), jsonFn);
    filter.catch(new HttpException('Down', HttpStatus.SERVICE_UNAVAILABLE), host);
    expect(jsonFn).toHaveBeenCalledWith(expect.objectContaining({ error: 'SERVICE_UNAVAILABLE' }));
  });

  it('flattens ValidationPipe array messages into a single string', () => {
    const host = makeHost(vi.fn(), jsonFn);
    const exception = new HttpException(
      { message: ['username must not be empty', 'password must be a string'], error: 'Bad Request' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, host);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'BAD_REQUEST',
        detail: 'username must not be empty; password must be a string',
      }),
    );
  });

  it('returns 500 INTERNAL_SERVER_ERROR for non-HTTP exceptions', () => {
    const host = makeHost(vi.fn(), jsonFn);
    filter.catch(new Error('boom'), host);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'INTERNAL_SERVER_ERROR' }),
    );
  });

  it('includes correlationId from request header', () => {
    const host = makeHost(vi.fn(), jsonFn);
    filter.catch(new HttpException('x', HttpStatus.BAD_REQUEST), host);
    const body = jsonFn.mock.calls[0][0] as ErrorBody;
    expect(body.correlationId).toBe(CORRELATION_ID);
  });

  it('uses "unknown" as correlationId when header is absent', () => {
    const host = makeHost(vi.fn(), jsonFn, { [CORRELATION_ID_HEADER]: undefined as unknown as string });
    filter.catch(new HttpException('x', HttpStatus.BAD_REQUEST), host);
    const body = jsonFn.mock.calls[0][0] as ErrorBody;
    expect(body.correlationId).toBe('unknown');
  });

  it('extracts string body.message when it is a plain string (not an array)', () => {
    const host = makeHost(vi.fn(), jsonFn);
    filter.catch(
      new HttpException({ message: 'field is required', statusCode: 400 }, HttpStatus.BAD_REQUEST),
      host,
    );
    expect(jsonFn).toHaveBeenCalledWith(expect.objectContaining({ detail: 'field is required' }));
  });

  it('falls back to 500 for non-Error, non-HttpException throws (e.g. thrown string)', () => {
    const host = makeHost(vi.fn(), jsonFn);
    filter.catch('some-string-error', host);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'INTERNAL_SERVER_ERROR' }),
    );
  });

  it('uses HTTP_<n> code for unmapped status codes', () => {
    const host = makeHost(vi.fn(), jsonFn);
    filter.catch(new HttpException('teapot', 418), host);
    expect(jsonFn).toHaveBeenCalledWith(expect.objectContaining({ error: 'HTTP_418' }));
  });
});
