import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, lastValueFrom } from 'rxjs';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { InMemoryIdempotencyStorage } from './in-memory-storage.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function makeContext(headers: Record<string, string> = {}): ExecutionContext {
  const req = { headers };
  const statusCode = { value: 200 };
  const res = {
    get statusCode() {
      return statusCode.value;
    },
    status(code: number) {
      statusCode.value = code;
      return this;
    },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe('IdempotencyInterceptor', () => {
  let storage: InMemoryIdempotencyStorage;
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    storage = new InMemoryIdempotencyStorage();
    interceptor = new IdempotencyInterceptor(storage);
  });

  describe('when no X-Idempotency-Key is provided', () => {
    it('passes through to the handler', async () => {
      const ctx = makeContext({});
      const handler = makeHandler({ result: 'ok' });
      const obs$ = await interceptor.intercept(ctx, handler);
      const result = await lastValueFrom(obs$);
      expect(result).toEqual({ result: 'ok' });
    });
  });

  describe('when an invalid UUID is provided', () => {
    it('throws 422 UNPROCESSABLE_ENTITY', async () => {
      const ctx = makeContext({ 'x-idempotency-key': 'not-a-uuid' });
      await expect(interceptor.intercept(ctx, makeHandler(null))).rejects.toBeInstanceOf(
        HttpException,
      );
      await expect(interceptor.intercept(ctx, makeHandler(null))).rejects.toMatchObject({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    });
  });

  describe('on first request (cache miss)', () => {
    it('executes the handler and returns its response', async () => {
      const ctx = makeContext({ 'x-idempotency-key': VALID_UUID });
      const obs$ = await interceptor.intercept(ctx, makeHandler({ data: 42 }));
      const result = await lastValueFrom(obs$);
      expect(result).toEqual({ data: 42 });
    });

    it('writes the response to the cache', async () => {
      const ctx = makeContext({ 'x-idempotency-key': VALID_UUID });
      const obs$ = await interceptor.intercept(ctx, makeHandler({ data: 42 }));
      await lastValueFrom(obs$);

      const cached = await storage.get(VALID_UUID);
      expect(cached).not.toBeNull();
      expect(cached?.body).toEqual({ data: 42 });
    });

    it('cache write is awaited before the observable completes (mergeMap fix)', async () => {
      const setSpy = vi.spyOn(storage, 'set');
      const ctx = makeContext({ 'x-idempotency-key': VALID_UUID });
      const obs$ = await interceptor.intercept(ctx, makeHandler('payload'));
      await lastValueFrom(obs$);
      // set must have been called and resolved before we got here
      expect(setSpy).toHaveBeenCalledOnce();
    });
  });

  describe('on duplicate request (cache hit)', () => {
    it('returns the cached response without calling the handler', async () => {
      // Prime the cache
      const ctx1 = makeContext({ 'x-idempotency-key': VALID_UUID });
      const obs1$ = await interceptor.intercept(ctx1, makeHandler({ original: true }));
      await lastValueFrom(obs1$);

      // Second request with same key — handler should NOT be called
      const handlerSpy = vi.fn(() => of({ original: false }));
      const ctx2 = makeContext({ 'x-idempotency-key': VALID_UUID });
      const obs2$ = await interceptor.intercept(ctx2, { handle: handlerSpy });
      const result = await lastValueFrom(obs2$);

      expect(handlerSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ original: true });
    });
  });
});
