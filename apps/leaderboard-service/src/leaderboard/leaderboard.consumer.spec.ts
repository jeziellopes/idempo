import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('kafkajs', () => ({
  Kafka: vi.fn(() => ({})),
}));

vi.mock('@idempo/kafka', () => {
  class BaseKafkaConsumer {
    constructor(_kafka: unknown, _group: string, _opts?: unknown) {}
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    subscribe = vi.fn().mockResolvedValue(undefined);
    start = vi.fn().mockResolvedValue(undefined);
  }
  return { BaseKafkaConsumer };
});

vi.mock('@idempo/observability', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { MatchEventsConsumer, LeaderboardConsumerService } from './leaderboard.consumer.js';
import { TOPICS } from '@idempo/contracts';
import type { MatchFinishedEvent, BaseEvent } from '@idempo/contracts';

const makeBaseEvent = (type: string): BaseEvent => ({
  eventId: 'evt-1',
  type,
  correlationId: 'corr-1',
  causationId: 'cause-1',
  version: 1,
  timestamp: new Date().toISOString(),
});

const makeMatchFinishedEvent = (scores: { playerId: string; score: number }[]): MatchFinishedEvent => ({
  ...makeBaseEvent('MatchFinishedEvent'),
  type: 'MatchFinishedEvent',
  matchId: 'match-1',
  winnerId: 'player-1',
  rewards: [{ type: 'currency', amount: 500 }],
  finalScores: scores,
});

describe('MatchEventsConsumer.handle()', () => {
  let mockRepo: { upsertScore: ReturnType<typeof vi.fn> };
  let consumer: MatchEventsConsumer;

  beforeEach(() => {
    mockRepo = { upsertScore: vi.fn().mockResolvedValue(undefined) };
    consumer = new MatchEventsConsumer({} as any, mockRepo as any);
  });

  it('ignores events that are not MatchFinishedEvent', async () => {
    await consumer.handle(makeBaseEvent('PlayerAttackedEvent'));
    expect(mockRepo.upsertScore).not.toHaveBeenCalled();
  });

  it('ignores events with an unexpected type string', async () => {
    await consumer.handle(makeBaseEvent('SomeOtherEvent'));
    expect(mockRepo.upsertScore).not.toHaveBeenCalled();
  });

  it('calls upsertScore once per finalScores entry on MatchFinishedEvent', async () => {
    const event = makeMatchFinishedEvent([
      { playerId: 'player-1', score: 200 },
      { playerId: 'player-2', score: 150 },
    ]);

    await consumer.handle(event);

    expect(mockRepo.upsertScore).toHaveBeenCalledTimes(2);
    expect(mockRepo.upsertScore).toHaveBeenCalledWith('player-1', 'player-1', 200);
    expect(mockRepo.upsertScore).toHaveBeenCalledWith('player-2', 'player-2', 150);
  });

  it('handles MatchFinishedEvent with empty finalScores without error', async () => {
    const event = makeMatchFinishedEvent([]);

    await consumer.handle(event);

    expect(mockRepo.upsertScore).not.toHaveBeenCalled();
  });
});

describe('LeaderboardConsumerService lifecycle', () => {
  let service: LeaderboardConsumerService;

  beforeEach(() => {
    const mockRepo = { upsertScore: vi.fn() };
    service = new LeaderboardConsumerService(mockRepo as any);
  });

  it('connects, subscribes, and starts the consumer on init', async () => {
    await service.onModuleInit();

    const consumer = (service as any).consumer;
    expect(consumer.connect).toHaveBeenCalled();
    expect(consumer.subscribe).toHaveBeenCalledWith([TOPICS.MATCH_EVENTS]);
    expect(consumer.start).toHaveBeenCalled();
  });

  it('disconnects the consumer on destroy', async () => {
    await service.onModuleDestroy();

    const consumer = (service as any).consumer;
    expect(consumer.disconnect).toHaveBeenCalled();
  });
});
