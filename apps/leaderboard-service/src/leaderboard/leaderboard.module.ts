import { Module } from '@nestjs/common';
import { LeaderboardController } from './leaderboard.controller.js';
import { LeaderboardRepository } from './leaderboard.repository.js';
import { LeaderboardConsumerService } from './leaderboard.consumer.js';

@Module({
  controllers: [LeaderboardController],
  providers: [LeaderboardRepository, LeaderboardConsumerService],
})
export class LeaderboardModule {}
