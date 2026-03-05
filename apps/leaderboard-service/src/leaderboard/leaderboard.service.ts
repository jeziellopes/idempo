import { Injectable } from '@nestjs/common';
import type { LeaderboardRepository} from './leaderboard.repository.js';
import { type RankEntry } from './leaderboard.repository.js';

@Injectable()
export class LeaderboardService {
  constructor(private readonly repo: LeaderboardRepository) {}

  async getTop100(): Promise<{ entries: RankEntry[]; meta: { stale: boolean; count: number } }> {
    const { entries, stale } = await this.repo.getTop100WithStaleFallback();
    return { entries, meta: { stale, count: entries.length } };
  }
}
