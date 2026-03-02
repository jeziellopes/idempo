import {
  type Consumer,
  type EachMessagePayload,
  type KafkaMessage,
  Kafka,
} from 'kafkajs';
import type { BaseEvent } from '@idempo/contracts';
import { getLogger } from '@idempo/observability';

const logger = getLogger('kafka:consumer');

export interface ConsumerOptions {
  /** Number of retries before routing to DLQ. Default: 3 */
  maxRetries?: number;
  /** Initial retry delay in ms. Default: 100 */
  initialRetryDelayMs?: number;
}

export abstract class BaseKafkaConsumer<T extends BaseEvent = BaseEvent> {
  private consumer: Consumer;
  private readonly maxRetries: number;
  private readonly initialRetryDelayMs: number;

  constructor(
    kafka: Kafka,
    private readonly groupId: string,
    options: ConsumerOptions = {},
  ) {
    this.maxRetries = options.maxRetries ?? 3;
    this.initialRetryDelayMs = options.initialRetryDelayMs ?? 100;
    this.consumer = kafka.consumer({ groupId });
  }

  async connect(): Promise<void> {
    await this.consumer.connect();
    logger.info({ groupId: this.groupId }, 'Kafka consumer connected');
  }

  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }

  async subscribe(topics: string[]): Promise<void> {
    await this.consumer.subscribe({ topics, fromBeginning: false });
  }

  async start(): Promise<void> {
    await this.consumer.run({
      eachMessage: async (payload) => {
        await this.handleWithRetry(payload);
      },
    });
  }

  private async handleWithRetry(payload: EachMessagePayload): Promise<void> {
    const { topic, message } = payload;
    const event = this.parseMessage(message);
    if (!event) return;

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      try {
        await this.handle(event);
        return;
      } catch (err) {
        attempt++;
        if (attempt > this.maxRetries) {
          logger.error(
            { err, topic, eventId: event.eventId, attempt },
            'Max retries exceeded — routing to DLQ',
          );
          await this.routeToDlq(topic, message, err as Error);
          return;
        }
        const delay = this.backoffDelay(attempt);
        logger.warn(
          { err, topic, eventId: event.eventId, attempt, delayMs: delay },
          'Consumer error — retrying',
        );
        await sleep(delay);
      }
    }
  }

  private parseMessage(message: KafkaMessage): T | null {
    try {
      if (!message.value) return null;
      return JSON.parse(message.value.toString()) as T;
    } catch (err) {
      logger.error({ err }, 'Failed to parse Kafka message');
      return null;
    }
  }

  /** Exponential backoff with jitter: base * 2^attempt * (0.5–1.5 random factor) */
  private backoffDelay(attempt: number): number {
    const base = this.initialRetryDelayMs * Math.pow(2, attempt - 1);
    const jitter = 0.5 + Math.random();
    return Math.min(base * jitter, 2000);
  }

  /**
   * Route a failed message to the DLQ topic (`<topic>.dlq`).
   * Subclasses can override to inject a DLQ producer.
   */
  protected async routeToDlq(
    topic: string,
    message: KafkaMessage,
    error: Error,
  ): Promise<void> {
    const dlqTopic = `${topic}.dlq`;
    logger.error(
      { dlqTopic, error: error.message },
      'DLQ routing — override routeToDlq() to publish via producer',
    );
  }

  /**
   * Implement business logic for a single event.
   * This method must be idempotent — see idempotency pattern in SPEC.md §5.2.
   */
  abstract handle(event: T): Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
