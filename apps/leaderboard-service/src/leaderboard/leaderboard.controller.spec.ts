import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderboardController } from './leaderboard.controller.js';
import type { LeaderboardService } from './leaderboard.service.js';
import type { RankEntry } from './leaderboard.repository.js';

type MockService = Pick<LeaderboardService, 'getTop100'>;

const makeEntry = (overrides: Partial<RankEntry> = {}): RankEntry => ({
  playerId: 'player-1',
  username: 'Alice',
  score: 100,
  rank: 1,
  updatedAt: '2026-03-02T00:00:00.000Z',
  ...overrides,
});

describe('LeaderboardController', () => {
  let mockService: MockService;
  let controller: LeaderboardController;

  beforeEach(() => {
    mockService = { getTop100: vi.fn() };
    controller = new LeaderboardController(mockService as unknown as LeaderboardService);
  });

  it('returns entries and meta when data is fresh', async () => {
    const entries = [makeEntry(), makeEntry({ playerId: 'player-2', rank: 2, score: 80 })];
    mockService.getTop100.mockResolvedValue({ entries, meta: { stale: false, count: 2 } });

    const result = await controller.getLeaderboard();

    expect(result.entries).toEqual(entries);
    expect(result.meta.stale).toBe(false);
    expect(result.meta.count).toBe(2);
  });

  it('propagates stale=true from the service', async () => {
    const entries = [makeEntry()];
    mockService.getTop100.mockResolvedValue({ entries, meta: { stale: true, count: 1 } });

    const result = await controller.getLeaderboard();

    expect(result.meta.stale).toBe(true);
  });

  it('returns empty entries and count=0 when no data is available', async () => {
    mockService.getTop100.mockResolvedValue({ entries: [], meta: { stale: true, count: 0 } });

    const result = await controller.getLeaderboard();

    expect(result.entries).toEqual([]);
    expect(result.meta.count).toBe(0);
  });

  it('delegates entirely to service.getTop100 without extra processing', async () => {
    mockService.getTop100.mockResolvedValue({ entries: [], meta: { stale: false, count: 0 } });

    await controller.getLeaderboard();

    expect(mockService.getTop100).toHaveBeenCalledOnce();
  });
});
