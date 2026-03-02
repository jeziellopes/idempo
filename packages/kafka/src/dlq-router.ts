import type { Producer, KafkaMessage } from 'kafkajs';
import { getLogger } from '@idempo/observability';

const logger = getLogger('kafka:dlq');

/**
 * Routes a failed message to its DLQ topic (`<topic>.dlq`).
 * Preserves original headers and appends failure metadata.
 */
export async function routeToDlq(
  producer: Producer,
  sourceTopic: string,
  message: KafkaMessage,
  error: Error,
): Promise<void> {
  const dlqTopic = `${sourceTopic}.dlq`;

  await producer.send({
    topic: dlqTopic,
    messages: [
      {
        key: message.key,
        value: message.value,
        headers: {
          ...message.headers,
          'dlq-source-topic': sourceTopic,
          'dlq-error-message': error.message,
          'dlq-error-stack': error.stack ?? '',
          'dlq-failed-at': new Date().toISOString(),
        },
      },
    ],
  });

  logger.warn(
    { dlqTopic, error: error.message },
    'Message routed to DLQ',
  );
}
