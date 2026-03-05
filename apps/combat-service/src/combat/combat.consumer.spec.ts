import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Kafka } from 'kafkajs';

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
  class BaseKafkaProducer {
    constructor(_kafka: unknown) {}
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    publish = vi.fn().mockResolvedValue([]);
  }
  return { BaseKafkaConsumer, BaseKafkaProducer };
});

vi.mock('@idempo/observability', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { PlayerActionConsumer, CombatConsumerService } from './combat.consumer.js';
import type { CombatEngineService } from './combat-engine.service.js';
import { TOPICS } from '@idempo/contracts';
import { BaseKafkaProducer } from '@idempo/kafka';

type MockEngine = {
  resolve: ReturnType<typeof vi.fn>;
};

// MockCombatProducer extends the mocked BaseKafkaProducer
class MockCombatProducer extends BaseKafkaProducer {
  constructor(kafka: Kafka) {
    super(kafka);
  }
}

interface PlayerActionEvent {
  eventId: string;
  type: 'PlayerActionEvent';
  actionId: string;
  matchId: string;
  playerId: string;
  actionType: string;
  payload: Record<string, unknown>;
  useStamp: boolean;
  correlationId: string;
  causationId: string;
  version: number;
  timestamp: string;
}

const makeAttackEvent = (overrides: Partial<PlayerActionEvent> = {}): PlayerActionEvent => ({
  eventId: 'evt-1',
  type: 'PlayerActionEvent',
  actionId: 'action-1',
  matchId: 'match-1',
  playerId: 'player-a',
  actionType: 'attack',
  payload: { targetId: 'player-b' },
  useStamp: false,
  correlationId: 'corr-1',
  causationId: 'cause-1',
  version: 1,
  timestamp: new Date().toISOString(),
  ...overrides,
});

const makeEngine = (): MockEngine => ({
  resolve: vi.fn().mockReturnValue({
    damage: 20,
    isCritical: false,
    event: {
      eventId: 'action-1',
      type: 'PlayerAttackedEvent',
      actionId: 'action-1',
      matchId: 'match-1',
      playerId: 'player-a',
      targetId: 'player-b',
      damage: 20,
      correlationId: 'corr-1',
      causationId: 'cause-1',
      version: 1,
      timestamp: new Date().toISOString(),
    },
  }),
});

const makeProducer = (): MockCombatProducer => {
  return new MockCombatProducer({} as Kafka);
};

describe('PlayerActionConsumer.handle()', () => {
  let engine: MockEngine;
  let producer: MockCombatProducer;
  let consumer: PlayerActionConsumer;

  beforeEach(() => {
    engine = makeEngine();
    producer = makeProducer();
    consumer = new PlayerActionConsumer(
      {} as Kafka,
      engine as unknown as CombatEngineService,
      producer
    );
  });

  it('returns early without processing when actionType is not "attack"', async () => {
    const event = makeAttackEvent({ actionType: 'move' });

    await consumer.handle(event);

    expect(engine.resolve).not.toHaveBeenCalled();
    expect(producer.publish).not.toHaveBeenCalled();
  });

  it('returns early with a warning when targetId is missing from payload', async () => {
    const event = makeAttackEvent({ payload: {} });

    await consumer.handle(event);

    expect(engine.resolve).not.toHaveBeenCalled();
    expect(producer.publish).not.toHaveBeenCalled();
  });

  it('returns early with a warning when targetId is an empty string', async () => {
    const event = makeAttackEvent({ payload: { targetId: '' } });

    await consumer.handle(event);

    expect(engine.resolve).not.toHaveBeenCalled();
  });

  it('resolves damage and publishes PlayerAttackedEvent on valid attack', async () => {
    const event = makeAttackEvent();

    await consumer.handle(event);

    expect(engine.resolve).toHaveBeenCalledWith({
      actionId: 'action-1',
      matchId: 'match-1',
      attackerId: 'player-a',
      targetId: 'player-b',
      correlationId: 'corr-1',
      causationId: 'evt-1',
    });
    expect(producer.publish).toHaveBeenCalledWith(
      TOPICS.MATCH_EVENTS,
      engine.resolve.mock.results[0]?.value.event,
      'match-1',
    );
  });
});

describe('CombatConsumerService lifecycle', () => {
  let service: CombatConsumerService;
  let engine: MockEngine;

  // Type for accessing private properties in tests
  type ServiceWithInternals = {
    producer: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
    consumer: {
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      subscribe: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    engine = makeEngine();
    service = new CombatConsumerService(engine as unknown as CombatEngineService);
  });

  it('connects producer and consumer, subscribes, and starts on init', async () => {
    await service.onModuleInit();

    const { producer: internalProducer, consumer: internalConsumer } =
      service as unknown as ServiceWithInternals;

    expect(internalProducer.connect).toHaveBeenCalled();
    expect(internalConsumer.connect).toHaveBeenCalled();
    expect(internalConsumer.subscribe).toHaveBeenCalledWith([TOPICS.PLAYER_ACTIONS]);
    expect(internalConsumer.start).toHaveBeenCalled();
  });

  it('disconnects consumer and producer on destroy', async () => {
    await service.onModuleDestroy();

    const { consumer: internalConsumer, producer: internalProducer } =
      service as unknown as ServiceWithInternals;

    expect(internalConsumer.disconnect).toHaveBeenCalled();
    expect(internalProducer.disconnect).toHaveBeenCalled();
  });
});
