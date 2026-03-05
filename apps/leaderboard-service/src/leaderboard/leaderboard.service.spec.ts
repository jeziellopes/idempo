import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderboardService } from './leaderboard.service.js';
import type { LeaderboardRepository, RankEntry } from './leaderboard.repository.js';

type MockRepo = Pick<LeaderboardRepository, 'getTop100WithStaleFallback'>;

const makeEntry = (overrides: Partial<RankEntry> = {}): RankEntry => ({
  playerId: 'player-1',
  username: 'Alice',
  score: 100,
  rank: 1,
  updatedAt: '2026-03-02T00:00:00.000Z',
  ...overrides,
});

describe('LeaderboardService', () => {
  let mockRepo: MockRepo;
  let service: LeaderboardService;

  beforeEach(() => {
    mockRepo = { getTop100WithStaleFallback: vi.fn() };
    service = new LeaderboardService(mockRepo as unknown as LeaderboardRepository);
  });

  it('returns entries and correct meta when data is fresh', async () => {
    const entries = [makeEntry(), makeEntry({ playerId: 'player-2', rank: 2, score: 80 })];
    mockRepo.getTop100WithStaleFallback.mockResolvedValue({ entries, stale: false });

    const result = await service.getTop100();

    expect(result.entries).toEqual(entries);
    expect(result.meta.stale).toBe(false);
    expect(result.meta.count).toBe(2);
  });

  it('returns entries and meta.stale=true when falling back to stale cache', async () => {
    const entries = [makeEntry()];
    mockRepo.getTop100WithStaleFallback.mockResolvedValue({ entries, stale: true });

    const result = await service.getTop100();

    expect(result.meta.stale).toBe(true);
    expect(result.meta.count).toBe(1);
  });

  it('returns empty entries with meta.stale=true when no data is available', async () => {
    mockRepo.getTop100WithStaleFallback.mockResolvedValue({ entries: [], stale: true });

    const result = await service.getTop100();

    expect(result.entries).toEqual([]);
    expect(result.meta.count).toBe(0);
    expect(result.meta.stale).toBe(true);
  });
});
