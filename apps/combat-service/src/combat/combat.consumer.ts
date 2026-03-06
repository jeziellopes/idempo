import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { BaseKafkaConsumer } from '@idempo/kafka';
import { BaseKafkaProducer } from '@idempo/kafka';
import { TOPICS } from '@idempo/contracts';
import type { BaseEvent } from '@idempo/contracts';
import { CombatEngineService } from './combat-engine.service.js';
import { getLogger } from '@idempo/observability';

const logger = getLogger('combat-service:consumer');

/** Shape of events arriving on the player-actions topic */
interface PlayerActionEvent extends BaseEvent {
  type: 'PlayerActionEvent';
  actionId: string;
  matchId: string;
  playerId: string;
  actionType: string;
  payload: Record<string, unknown>;
  useStamp: boolean;
}

class CombatProducer extends BaseKafkaProducer {
  constructor(kafka: Kafka) { super(kafka); }
}

export class PlayerActionConsumer extends BaseKafkaConsumer<PlayerActionEvent> {
  constructor(
    kafka: Kafka,
    private readonly engine: CombatEngineService,
    private readonly producer: CombatProducer,
  ) {
    super(kafka, 'combat-service-group');
  }

  async handle(event: PlayerActionEvent): Promise<void> {
    if (event.actionType !== 'attack') return;

    const targetId = (event.payload['targetId'] as string | undefined) ?? '';
    if (!targetId) {
      logger.warn({ actionId: event.actionId }, 'Attack action missing targetId');
      return;
    }

    const result = this.engine.resolve({
      actionId: event.actionId,
      matchId: event.matchId,
      attackerId: event.playerId,
      targetId,
      correlationId: event.correlationId,
      causationId: event.eventId,
    });

    await this.producer.publish(TOPICS.MATCH_EVENTS, result.event, event.matchId);

    logger.info(
      { actionId: event.actionId, damage: result.damage, isCritical: result.isCritical },
      'PlayerAttackedEvent emitted',
    );
  }
}

@Injectable()
export class CombatConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer: PlayerActionConsumer;
  private producer: CombatProducer;

  constructor(private readonly engine: CombatEngineService) {
    const kafka = new Kafka({
      clientId: 'combat-service',
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    });
    this.producer = new CombatProducer(kafka);
    this.consumer = new PlayerActionConsumer(kafka, this.engine, this.producer);
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe([TOPICS.PLAYER_ACTIONS]);
    await this.consumer.start();
    logger.info('Combat consumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
    await this.producer.disconnect();
  }
}
