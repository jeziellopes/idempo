import { Module } from '@nestjs/common';
import { CombatEngineService } from './combat-engine.service.js';
import { CombatConsumerService } from './combat.consumer.js';

@Module({
  providers: [CombatEngineService, CombatConsumerService],
})
export class CombatModule {}
