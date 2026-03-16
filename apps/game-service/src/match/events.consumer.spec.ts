import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@idempo/observability', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@idempo/kafka', () => ({
  BaseKafkaConsumer: class {
    constructor(
      public readonly kafka: unknown,
      public readonly groupId: string,
    ) {}
    async connect() { /* noop */ }
    async disconnect() { /* noop */ }
    async subscribe(_topics: string[]) { /* noop */ }
    async start() { /* noop */ }
  },
}));

vi.mock('kafkajs', () => ({
  Kafka: vi.fn(() => ({})),
}));

import { MatchEventsConsumer, MatchEventsConsumerService } from './events.consumer.js';
import type { MatchRepository } from './match.repository.js';
import type { MatchGateway } from './match.gateway.js';
import type { Kafka } from 'kafkajs';

type MockRepo = {
  [K in keyof Pick<MatchRepository, 'applyDamage' | 'getPlayers'>]: ReturnType<typeof vi.fn>;
};
type MockGateway = {
  [K in keyof Pick<MatchGateway, 'broadcastMatchState'>]: ReturnType<typeof vi.fn>;
};

const makePlayer = (overrides: Record<string, unknown> = {}) => ({
  matchId: 'match-1',
  playerId: 'target-1',
  username: 'Bob',
  hp: 80,
  score: 0,
  resources: 0,
  shields: 0,
  positionX: 1,
  positionY: 1,
  alive: true,
  team: null,
  finalScore: 0,
  isBot: false,
  ...overrides,
});

describe('MatchEventsConsumer', () => {
  let consumer: MatchEventsConsumer;
  let mockRepo: MockRepo;
  let mockGateway: MockGateway;

  beforeEach(() => {
    mockRepo = {
      applyDamage: vi.fn().mockResolvedValue(makePlayer()),
      getPlayers: vi.fn().mockResolvedValue([makePlayer()]),
    };
    mockGateway = { broadcastMatchState: vi.fn() };

    consumer = new MatchEventsConsumer(
      {} as unknown as Kafka,
      mockRepo as unknown as MatchRepository,
      mockGateway as unknown as MatchGateway,
    );
  });

  it('applies damage and broadcasts tick on PlayerAttackedEvent', async () => {
    const event = {
      eventId: 'e1',
      correlationId: 'c1',
      causationId: 'c1',
      version: 1 as const,
      timestamp: new Date().toISOString(),
      type: 'PlayerAttackedEvent' as const,
      actionId: 'a1',
      playerId: 'attacker-1',
      targetId: 'target-1',
      matchId: 'match-1',
      damage: 20,
    };

    await consumer.handle(event);

    expect(mockRepo.applyDamage).toHaveBeenCalledWith('match-1', 'target-1', 20);
    expect(mockRepo.getPlayers).toHaveBeenCalledWith('match-1');
    expect(mockGateway.broadcastMatchState).toHaveBeenCalledWith(
      'match-1',
      expect.objectContaining({ event: 'tick' }),
    );
  });

  it('ignores non-PlayerAttackedEvent events', async () => {
    const event = {
      eventId: 'e2',
      correlationId: 'c2',
      causationId: 'c2',
      version: 1 as const,
      timestamp: new Date().toISOString(),
      type: 'StampUsedEvent',
    } as Parameters<typeof consumer.handle>[0];

    await consumer.handle(event);

    expect(mockRepo.applyDamage).not.toHaveBeenCalled();
    expect(mockGateway.broadcastMatchState).not.toHaveBeenCalled();
  });

  it('re-throws errors from applyDamage so BaseKafkaConsumer can retry', async () => {
    mockRepo.applyDamage.mockRejectedValue(new Error('db failure'));

    const event = {
      eventId: 'e3',
      correlationId: 'c3',
      causationId: 'c3',
      version: 1 as const,
      timestamp: new Date().toISOString(),
      type: 'PlayerAttackedEvent' as const,
      actionId: 'a3',
      playerId: 'attacker-1',
      targetId: 'target-1',
      matchId: 'match-1',
      damage: 10,
    };

    await expect(consumer.handle(event)).rejects.toThrow('db failure');
  });
});

describe('MatchEventsConsumerService', () => {
  let mockRepo: MockRepo;
  let mockGateway: MockGateway;

  beforeEach(() => {
    mockRepo = {
      applyDamage: vi.fn(),
      getPlayers: vi.fn(),
    };
    mockGateway = { broadcastMatchState: vi.fn() };
  });

  it('exposes onModuleInit and onModuleDestroy lifecycle hooks', () => {
    const svc = new MatchEventsConsumerService(
      mockRepo as unknown as MatchRepository,
      mockGateway as unknown as MatchGateway,
    );

    expect(typeof svc.onModuleInit).toBe('function');
    expect(typeof svc.onModuleDestroy).toBe('function');
  });

  it('connects and starts the consumer on module init', async () => {
    const svc = new MatchEventsConsumerService(
      mockRepo as unknown as MatchRepository,
      mockGateway as unknown as MatchGateway,
    );

    // Mocked @idempo/kafka and kafkajs — no real connection, should not throw
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });

  it('disconnects the consumer on module destroy', async () => {
    const svc = new MatchEventsConsumerService(
      mockRepo as unknown as MatchRepository,
      mockGateway as unknown as MatchGateway,
    );

    await svc.onModuleInit();
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('does not throw on destroy before init (guard on undefined consumer)', async () => {
    const svc = new MatchEventsConsumerService(
      mockRepo as unknown as MatchRepository,
      mockGateway as unknown as MatchGateway,
    );

    // onModuleDestroy called without prior onModuleInit (consumer is undefined)
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
  });
});
