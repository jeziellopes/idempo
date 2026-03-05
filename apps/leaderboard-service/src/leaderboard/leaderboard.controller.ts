import { Controller, Get } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service.js';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly service: LeaderboardService) {}

  /**
   * GET /api/leaderboard
   * Returns top-100 players. Falls back to stale Redis cache if DB is unavailable.
   */
  @Get()
  async getLeaderboard() {
    return this.service.getTop100();
  }
}
