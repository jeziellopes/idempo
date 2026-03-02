import { Kafka, type KafkaConfig } from 'kafkajs';

export function createKafkaClient(config?: Partial<KafkaConfig>): Kafka {
  return new Kafka({
    clientId: config?.clientId ?? 'idempo-service',
    brokers: config?.brokers ?? (process.env['KAFKA_BROKERS']?.split(',') ?? ['localhost:9092']),
    ...config,
  });
}
