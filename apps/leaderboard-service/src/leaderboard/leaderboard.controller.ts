import { Controller, Get } from '@nestjs/common';
import { LeaderboardRepository } from './leaderboard.repository.js';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly repo: LeaderboardRepository) {}

  /**
   * GET /api/leaderboard
   * Returns top-100 players. Falls back to stale Redis cache if DB is unavailable.
   */
  @Get()
  async getLeaderboard() {
    const { entries, stale } = await this.repo.getTop100WithStaleFallback();
    return { entries, meta: { stale, count: entries.length } };
  }
}
