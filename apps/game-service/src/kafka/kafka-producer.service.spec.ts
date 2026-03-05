import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@idempo/observability', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mockProducer = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
};

vi.mock('kafkajs', () => ({
  Kafka: vi.fn().mockImplementation(() => ({
    producer: vi.fn().mockReturnValue(mockProducer),
  })),
}));

import { KafkaProducerService } from './kafka-producer.service.js';

describe('KafkaProducerService', () => {
  let service: KafkaProducerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new KafkaProducerService();
  });

  it('connects the producer on module init', async () => {
    await service.onModuleInit();

    expect(mockProducer.connect).toHaveBeenCalledOnce();
  });

  it('disconnects the producer on module destroy', async () => {
    await service.onModuleDestroy();

    expect(mockProducer.disconnect).toHaveBeenCalledOnce();
  });

  it('serialises the message value as JSON and forwards to the correct topic', async () => {
    const payload = { eventId: 'evt-1', type: 'PlayerActionEvent', matchId: 'match-1' };

    await service.send('player-actions', { key: 'match-1', value: payload });

    expect(mockProducer.send).toHaveBeenCalledWith({
      topic: 'player-actions',
      messages: [{ key: 'match-1', value: JSON.stringify(payload) }],
    });
  });
});
