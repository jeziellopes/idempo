import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { RedisModule } from './redis/redis.module.js';
import { LeaderboardModule } from './leaderboard/leaderboard.module.js';
import { MetricsModule } from '@idempo/observability';

@Module({
  imports: [DatabaseModule, RedisModule, MetricsModule, LeaderboardModule],
})
export class AppModule {}
