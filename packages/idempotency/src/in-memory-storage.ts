/**
 * In-memory idempotency storage — for testing and local dev only.
 * Production: use RedisIdempotencyStorage (apps provide their own adapter).
 */
import type { CachedResponse, IdempotencyStorage } from './idempotency.interceptor.js';

export class InMemoryIdempotencyStorage implements IdempotencyStorage {
  private readonly store = new Map<string, { response: CachedResponse; expiresAt: number }>();

  async get(key: string): Promise<CachedResponse | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.response;
  }

  async set(key: string, response: CachedResponse, ttlSeconds = 86400): Promise<void> {
    this.store.set(key, {
      response,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}
