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
import { CombatEngineService } from './combat-engine.service.js';
import { TOPICS } from '@idempo/contracts';

const makeAttackEvent = (overrides: Record<string, unknown> = {}) => ({
  eventId: 'evt-1',
  type: 'PlayerActionEvent' as const,
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

const makeEngine = () => ({
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

const makeProducer = () => ({
  publish: vi.fn().mockResolvedValue([]),
});

describe('PlayerActionConsumer.handle()', () => {
  let engine: ReturnType<typeof makeEngine>;
  let producer: ReturnType<typeof makeProducer>;
  let consumer: PlayerActionConsumer;

  beforeEach(() => {
    engine = makeEngine();
    producer = makeProducer();
    consumer = new PlayerActionConsumer({} as any, engine as any, producer as any);
  });

  it('returns early without processing when actionType is not "attack"', async () => {
    const event = makeAttackEvent({ actionType: 'move' });

    await consumer.handle(event as any);

    expect(engine.resolve).not.toHaveBeenCalled();
    expect(producer.publish).not.toHaveBeenCalled();
  });

  it('returns early with a warning when targetId is missing from payload', async () => {
    const event = makeAttackEvent({ payload: {} });

    await consumer.handle(event as any);

    expect(engine.resolve).not.toHaveBeenCalled();
    expect(producer.publish).not.toHaveBeenCalled();
  });

  it('returns early with a warning when targetId is an empty string', async () => {
    const event = makeAttackEvent({ payload: { targetId: '' } });

    await consumer.handle(event as any);

    expect(engine.resolve).not.toHaveBeenCalled();
  });

  it('resolves damage and publishes PlayerAttackedEvent on valid attack', async () => {
    const event = makeAttackEvent();

    await consumer.handle(event as any);

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
  let engine: ReturnType<typeof makeEngine>;

  beforeEach(() => {
    engine = makeEngine();
    service = new CombatConsumerService(engine as any);
  });

  it('connects producer and consumer, subscribes, and starts on init', async () => {
    await service.onModuleInit();

    const internalProducer = (service as any).producer;
    const internalConsumer = (service as any).consumer;

    expect(internalProducer.connect).toHaveBeenCalled();
    expect(internalConsumer.connect).toHaveBeenCalled();
    expect(internalConsumer.subscribe).toHaveBeenCalledWith([TOPICS.PLAYER_ACTIONS]);
    expect(internalConsumer.start).toHaveBeenCalled();
  });

  it('disconnects consumer and producer on destroy', async () => {
    await service.onModuleDestroy();

    const internalConsumer = (service as any).consumer;
    const internalProducer = (service as any).producer;

    expect(internalConsumer.disconnect).toHaveBeenCalled();
    expect(internalProducer.disconnect).toHaveBeenCalled();
  });
});
