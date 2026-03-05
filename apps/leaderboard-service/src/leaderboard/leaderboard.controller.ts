import { Controller, Get } from '@nestjs/common';
import type { LeaderboardService } from './leaderboard.service.js';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  /**
   * GET /api/leaderboard
   * Returns top-100 players. Falls back to stale Redis cache if DB is unavailable.
   */
  @Get()
  async getLeaderboard() {
    return this.leaderboardService.getTop100();
  }
}
