import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { BaseKafkaConsumer } from '@idempo/kafka';
import { TOPICS } from '@idempo/contracts';
import type { BaseEvent, PlayerAttackedEvent } from '@idempo/contracts';
import { MatchRepository } from './match.repository.js';
import { MatchGateway } from './match.gateway.js';
import { getLogger } from '@idempo/observability';

const logger = getLogger('game-service:events-consumer');

type AnyMatchEvent = BaseEvent & { type: string };

export class MatchEventsConsumer extends BaseKafkaConsumer<AnyMatchEvent> {
  constructor(
    kafka: Kafka,
    private readonly repo: MatchRepository,
    private readonly gateway: MatchGateway,
  ) {
    super(kafka, 'game-service-match-events-group');
  }

  async handle(event: AnyMatchEvent): Promise<void> {
    if (event.type !== 'PlayerAttackedEvent') return;

    const e = event as PlayerAttackedEvent;
    await this.repo.applyDamage(e.matchId, e.targetId, e.damage);

    const players = await this.repo.getPlayers(e.matchId);
    this.gateway.broadcastMatchState(e.matchId, { event: 'tick', players });

    logger.info(
      { matchId: e.matchId, targetId: e.targetId, damage: e.damage },
      'Damage applied from PlayerAttackedEvent',
    );
  }
}

@Injectable()
export class MatchEventsConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer!: MatchEventsConsumer;

  constructor(
    private readonly repo: MatchRepository,
    private readonly gateway: MatchGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    const kafka = new Kafka({
      clientId: 'game-service-events',
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    });
    this.consumer = new MatchEventsConsumer(kafka, this.repo, this.gateway);
    await this.consumer.connect();
    await this.consumer.subscribe([TOPICS.MATCH_EVENTS]);
    await this.consumer.start();
    logger.info('Match events consumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
  }
}
