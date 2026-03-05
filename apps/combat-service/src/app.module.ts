import { Module } from '@nestjs/common';
import { CombatModule } from './combat/combat.module.js';
import { MetricsModule } from '@idempo/observability';

@Module({
  imports: [MetricsModule, CombatModule],
})
export class AppModule {}
