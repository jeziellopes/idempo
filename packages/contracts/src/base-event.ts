/**
 * Base envelope that every Kafka event must extend.
 * Provides the tracing/idempotency fields used across all consumers.
 */
export interface BaseEvent {
  /** UUID v4 — globally unique per event emission */
  eventId: string;
  /** Tracks the full request chain for distributed tracing */
  correlationId: string;
  /** eventId of the direct parent event */
  causationId: string;
  /** Schema version — increment on breaking changes */
  version: number;
  /** ISO 8601 timestamp */
  timestamp: string;
}
