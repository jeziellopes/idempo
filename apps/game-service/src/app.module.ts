import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { MatchModule } from './match/match.module.js';
import { KafkaModule } from './kafka/kafka.module.js';
import { MetricsModule } from '@idempo/observability';

@Module({
  imports: [DatabaseModule, MetricsModule, KafkaModule, MatchModule],
})
export class AppModule {}
