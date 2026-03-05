import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service.js';

@Module({
  providers: [KafkaProducerService],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
