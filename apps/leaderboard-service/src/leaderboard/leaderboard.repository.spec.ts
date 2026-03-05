import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderboardRepository, type RankEntry } from './leaderboard.repository.js';
import type pg from 'pg';
import type Redis from 'ioredis';

const REDIS_KEY = 'leaderboard:top100';

const makeEntry = (overrides: Partial<RankEntry> = {}): RankEntry => ({
  playerId: 'player-1',
  username: 'Alice',
  score: 100,
  rank: 1,
  updatedAt: '2026-03-02T00:00:00.000Z',
  ...overrides,
});

describe('LeaderboardRepository', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockGet: ReturnType<typeof vi.fn>;
  let mockSet: ReturnType<typeof vi.fn>;
  let mockDel: ReturnType<typeof vi.fn>;
  let repo: LeaderboardRepository;

  beforeEach(() => {
    mockQuery = vi.fn();
    mockGet = vi.fn().mockResolvedValue(null);
    mockSet = vi.fn().mockResolvedValue('OK');
    mockDel = vi.fn().mockResolvedValue(1);

    const mockPool = { query: mockQuery } as unknown as pg.Pool;
    const mockRedis = { get: mockGet, set: mockSet, del: mockDel } as unknown as Redis;
    repo = new LeaderboardRepository(mockPool, mockRedis);
  });

  // ── upsertScore ─────────────────────────────────────────────────────────────

  describe('upsertScore()', () => {
    it('executes INSERT ON CONFLICT upsert and invalidates the Redis cache', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await repo.upsertScore('player-1', 'Alice', 50);

      expect(mockQuery).toHaveBeenCalledOnce();
      const sql: string = mockQuery.mock.calls[0]![0];
      expect(sql).toContain('ON CONFLICT');
      expect(mockDel).toHaveBeenCalledWith(REDIS_KEY);
    });
  });

  // ── getTop100 ────────────────────────────────────────────────────────────────

  describe('getTop100()', () => {
    it('returns cached data and skips DB query on cache hit', async () => {
      const cached = [makeEntry()];
      mockGet.mockResolvedValue(JSON.stringify(cached));

      const result = await repo.getTop100();

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('queries DB and caches result on cache miss', async () => {
      const rows = [makeEntry()];
      mockGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({ rows });

      const result = await repo.getTop100();

      expect(mockQuery).toHaveBeenCalledOnce();
      expect(mockSet).toHaveBeenCalledWith(REDIS_KEY, JSON.stringify(rows), 'EX', 60);
      expect(result).toEqual(rows);
    });
  });

  // ── getTop100WithStaleFallback ───────────────────────────────────────────────

  describe('getTop100WithStaleFallback()', () => {
    it('returns fresh data with stale=false when DB is available', async () => {
      const rows = [makeEntry()];
      mockQuery.mockResolvedValue({ rows });
      mockSet.mockResolvedValue('OK');

      const result = await repo.getTop100WithStaleFallback();

      expect(result.stale).toBe(false);
      expect(result.entries).toEqual(rows);
    });

    it('returns stale cache with stale=true when DB throws', async () => {
      const staleEntries = [makeEntry({ score: 99 })];
      mockQuery.mockRejectedValue(new Error('connection refused'));
      mockGet.mockResolvedValue(JSON.stringify(staleEntries));

      const result = await repo.getTop100WithStaleFallback();

      expect(result.stale).toBe(true);
      expect(result.entries).toEqual(staleEntries);
    });

    it('returns empty entries with stale=true when DB throws and cache is empty', async () => {
      mockQuery.mockRejectedValue(new Error('connection refused'));
      mockGet.mockResolvedValue(null);

      const result = await repo.getTop100WithStaleFallback();

      expect(result.stale).toBe(true);
      expect(result.entries).toEqual([]);
    });
  });
});
