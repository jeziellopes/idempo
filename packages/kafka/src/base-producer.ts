import { Kafka, type Producer, type ProducerRecord, type RecordMetadata } from 'kafkajs';
import type { BaseEvent } from '@idempo/contracts';
import { getLogger } from '@idempo/observability';

const logger = getLogger('kafka:producer');

export abstract class BaseKafkaProducer {
  private producer: Producer;

  constructor(kafka: Kafka) {
    this.producer = kafka.producer({
      allowAutoTopicCreation: false,
      idempotent: true, // Kafka producer-side idempotency
    });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
    logger.info('Kafka producer connected');
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
    logger.info('Kafka producer disconnected');
  }

  /**
   * Publish a single event. The event's correlationId is set as the Kafka message key
   * when no explicit key is provided, ensuring ordering within a partition.
   */
  async publish<T extends BaseEvent>(
    topic: string,
    event: T,
    partitionKey?: string,
  ): Promise<RecordMetadata[]> {
    const record: ProducerRecord = {
      topic,
      messages: [
        {
          key: partitionKey ?? event.correlationId,
          value: JSON.stringify(event),
          headers: {
            eventId: event.eventId,
            correlationId: event.correlationId,
            causationId: event.causationId,
            version: String(event.version),
          },
        },
      ],
    };

    const result = await this.producer.send(record);
    logger.debug({ topic, eventId: event.eventId, type: (event as any).type }, 'Event published');
    return result;
  }

  /**
   * Publish multiple events in a single batch.
   */
  async publishBatch<T extends BaseEvent>(
    topic: string,
    events: T[],
    getPartitionKey?: (e: T) => string,
  ): Promise<RecordMetadata[]> {
    const record: ProducerRecord = {
      topic,
      messages: events.map((event) => ({
        key: getPartitionKey ? getPartitionKey(event) : event.correlationId,
        value: JSON.stringify(event),
        headers: {
          eventId: event.eventId,
          correlationId: event.correlationId,
          causationId: event.causationId,
          version: String(event.version),
        },
      })),
    };

    const result = await this.producer.send(record);
    logger.debug({ topic, count: events.length }, 'Event batch published');
    return result;
  }
}
