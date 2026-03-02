import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryIdempotencyStorage } from './in-memory-storage.js';

describe('InMemoryIdempotencyStorage', () => {
  let storage: InMemoryIdempotencyStorage;

  beforeEach(() => {
    storage = new InMemoryIdempotencyStorage();
  });

  it('returns null for an unknown key', async () => {
    await expect(storage.get('unknown')).resolves.toBeNull();
  });

  it('stores and retrieves a response', async () => {
    const response = { statusCode: 200, body: { ok: true }, cachedAt: '2026-03-02T00:00:00Z' };
    await storage.set('key-1', response);
    await expect(storage.get('key-1')).resolves.toEqual(response);
  });

  it('returns null after TTL expires', async () => {
    vi.useFakeTimers();
    const response = { statusCode: 200, body: { ok: true }, cachedAt: '2026-03-02T00:00:00Z' };
    await storage.set('key-ttl', response, 10); // 10 s TTL

    vi.advanceTimersByTime(11_000);
    await expect(storage.get('key-ttl')).resolves.toBeNull();

    vi.useRealTimers();
  });

  it('overwrites an existing entry on set', async () => {
    const first = { statusCode: 200, body: { v: 1 }, cachedAt: '2026-03-02T00:00:00Z' };
    const second = { statusCode: 201, body: { v: 2 }, cachedAt: '2026-03-02T00:01:00Z' };
    await storage.set('key-overwrite', first);
    await storage.set('key-overwrite', second);
    await expect(storage.get('key-overwrite')).resolves.toEqual(second);
  });

  it('isolates different keys', async () => {
    const a = { statusCode: 200, body: 'a', cachedAt: '' };
    const b = { statusCode: 201, body: 'b', cachedAt: '' };
    await storage.set('key-a', a);
    await storage.set('key-b', b);
    await expect(storage.get('key-a')).resolves.toEqual(a);
    await expect(storage.get('key-b')).resolves.toEqual(b);
  });
});
