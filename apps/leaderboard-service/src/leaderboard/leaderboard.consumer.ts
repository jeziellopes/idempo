import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { BaseKafkaConsumer } from '@idempo/kafka';
import { TOPICS } from '@idempo/contracts';
import type { MatchFinishedEvent, BaseEvent } from '@idempo/contracts';
import { LeaderboardRepository } from './leaderboard.repository.js';
import { getLogger } from '@idempo/observability';

const logger = getLogger('leaderboard-service:consumer');

export class MatchEventsConsumer extends BaseKafkaConsumer<BaseEvent> {
  constructor(
    kafka: Kafka,
    private readonly repo: LeaderboardRepository,
  ) {
    super(kafka, 'leaderboard-service-match-group');
  }

  async handle(event: BaseEvent): Promise<void> {
    if (event.type !== 'MatchFinishedEvent') return;

    const matchEvent = event as MatchFinishedEvent;
    logger.info({ matchId: matchEvent.matchId }, 'Processing MatchFinishedEvent for leaderboard');

    // Update score for each player from finalScores
    await Promise.all(
      matchEvent.finalScores.map((entry) =>
        this.repo.upsertScore(entry.playerId, entry.username, entry.score),
      ),
    );
  }
}

@Injectable()
export class LeaderboardConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer: MatchEventsConsumer;

  constructor(private readonly repo: LeaderboardRepository) {
    const kafka = new Kafka({
      clientId: 'leaderboard-service',
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    });
    this.consumer = new MatchEventsConsumer(kafka, this.repo);
  }

  async onModuleInit(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe([TOPICS.MATCH_EVENTS]);
    await this.consumer.start();
    logger.info('Leaderboard consumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }
}
