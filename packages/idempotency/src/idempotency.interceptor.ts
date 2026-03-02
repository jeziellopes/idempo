import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import type { Request, Response } from 'express';

export interface IdempotencyStorage {
  get(key: string): Promise<CachedResponse | null>;
  set(key: string, response: CachedResponse, ttlSeconds?: number): Promise<void>;
}

export interface CachedResponse {
  statusCode: number;
  body: unknown;
  cachedAt: string;
}

/**
 * NestJS interceptor that enforces the X-Idempotency-Key header pattern (SPEC.md §5.1).
 *
 * - On first request: executes the handler and caches the response against the key.
 * - On duplicate request (same key): returns the cached response immediately.
 *   The handler is NOT re-executed — guaranteeing at-most-once side effects.
 *
 * Attach to any mutating endpoint:
 *   @UseInterceptors(IdempotencyInterceptor)
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly storage: IdempotencyStorage,
    private readonly ttlSeconds: number = 86400, // 24h default
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const key = req.headers['x-idempotency-key'] as string | undefined;
    if (!key) {
      // No key provided — pass through without idempotency guarantee
      return next.handle();
    }

    if (!isValidUUID(key)) {
      throw new HttpException(
        'X-Idempotency-Key must be a valid UUID v4',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const cached = await this.storage.get(key);
    if (cached) {
      this.logger.debug({ key }, 'Idempotency cache hit — returning cached response');
      res.status(cached.statusCode);
      return of(cached.body);
    }

    return next.handle().pipe(
      // mergeMap correctly awaits the async storage write before emitting the value.
      // The previous tap(async ...) implementation discarded the Promise — the cache
      // write was fire-and-forget, causing duplicate executions under concurrent retries.
      mergeMap(async (body: unknown) => {
        const statusCode = res.statusCode;
        await this.storage.set(key, { statusCode, body, cachedAt: new Date().toISOString() }, this.ttlSeconds);
        this.logger.debug({ key, statusCode }, 'Response cached for idempotency key');
        return body;
      }),
    );
  }
}

/** Validates UUID v4 format */
function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
