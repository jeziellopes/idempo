import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderboardController } from './leaderboard.controller.js';
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

describe('LeaderboardController', () => {
  let mockRepo: MockRepo;
  let controller: LeaderboardController;

  beforeEach(() => {
    mockRepo = { getTop100WithStaleFallback: vi.fn() };
    controller = new LeaderboardController(mockRepo as unknown as LeaderboardRepository);
  });

  it('returns entries and meta when data is fresh', async () => {
    const entries = [makeEntry(), makeEntry({ playerId: 'player-2', rank: 2, score: 80 })];
    mockRepo.getTop100WithStaleFallback.mockResolvedValue({ entries, stale: false });

    const result = await controller.getLeaderboard();

    expect(result.entries).toEqual(entries);
    expect(result.meta.stale).toBe(false);
    expect(result.meta.count).toBe(2);
  });

  it('propagates stale=true from the repository', async () => {
    const entries = [makeEntry()];
    mockRepo.getTop100WithStaleFallback.mockResolvedValue({ entries, stale: true });

    const result = await controller.getLeaderboard();

    expect(result.meta.stale).toBe(true);
  });

  it('returns empty entries and count=0 when no data is available', async () => {
    mockRepo.getTop100WithStaleFallback.mockResolvedValue({ entries: [], stale: true });

    const result = await controller.getLeaderboard();

    expect(result.entries).toEqual([]);
    expect(result.meta.count).toBe(0);
  });

  it('delegates entirely to repo.getTop100WithStaleFallback without extra processing', async () => {
    mockRepo.getTop100WithStaleFallback.mockResolvedValue({ entries: [], stale: false });

    await controller.getLeaderboard();

    expect(mockRepo.getTop100WithStaleFallback).toHaveBeenCalledOnce();
  });
});
