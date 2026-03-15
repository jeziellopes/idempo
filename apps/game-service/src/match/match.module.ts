import { Module, forwardRef } from '@nestjs/common';
import { MatchController } from './match.controller.js';
import { MatchService } from './match.service.js';
import { MatchRepository } from './match.repository.js';
import { MatchGateway } from './match.gateway.js';
import { KafkaModule } from '../kafka/kafka.module.js';
import { BotService } from '../bot/bot.service.js';

@Module({
  imports: [KafkaModule],
  controllers: [MatchController],
  providers: [MatchService, MatchRepository, MatchGateway, BotService],
  exports: [MatchService],
})
export class MatchModule {}
