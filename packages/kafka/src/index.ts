export { BaseKafkaProducer } from './base-producer.js';
export { BaseKafkaConsumer, type ConsumerOptions } from './base-consumer.js';
export { withIdempotency, InMemoryIdempotencyStore, type IdempotencyStore } from './idempotency-hook.js';
export { routeToDlq } from './dlq-router.js';
export { createKafkaClient } from './kafka-client.js';
