import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Kafka, type Producer } from 'kafkajs';
import { getLogger } from '@idempo/observability';

const logger = getLogger('game-service:kafka');

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly kafka: Kafka;
  private producer!: Producer;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'game-service',
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    logger.info('Kafka producer connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async send(topic: string, message: { key: string; value: unknown }): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{ key: message.key, value: JSON.stringify(message.value) }],
    });
  }
}
