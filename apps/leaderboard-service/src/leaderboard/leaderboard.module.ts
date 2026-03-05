import { Module } from '@nestjs/common';
import { LeaderboardController } from './leaderboard.controller.js';
import { LeaderboardRepository } from './leaderboard.repository.js';
import { LeaderboardConsumerService } from './leaderboard.consumer.js';
import { LeaderboardService } from './leaderboard.service.js';

@Module({
  controllers: [LeaderboardController],
  providers: [LeaderboardRepository, LeaderboardConsumerService, LeaderboardService],
})
export class LeaderboardModule {}
