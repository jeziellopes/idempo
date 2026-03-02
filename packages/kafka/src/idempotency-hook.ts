import type { BaseEvent } from '@idempo/contracts';
import { getLogger } from '@idempo/observability';

const logger = getLogger('kafka:idempotency');

export interface IdempotencyStore {
  /** Returns true if this eventId has already been processed */
  has(eventId: string): Promise<boolean>;
  /** Mark eventId as processed — must be called inside the same transaction as the business effect */
  mark(eventId: string): Promise<void>;
}

/**
 * Wraps a consumer handler with the idempotency check pattern from SPEC.md §5.2.
 *
 * Usage:
 *   async handle(event: MyEvent) {
 *     await withIdempotency(this.store, event, async () => {
 *       // business logic here — runs exactly once
 *     });
 *   }
 */
export async function withIdempotency<T extends BaseEvent>(
  store: IdempotencyStore,
  event: T,
  handler: (event: T) => Promise<void>,
): Promise<void> {
  const alreadyProcessed = await store.has(event.eventId);
  if (alreadyProcessed) {
    logger.debug({ eventId: event.eventId }, 'Duplicate event — skipping (idempotent)');
    return;
  }

  await handler(event);
  await store.mark(event.eventId);
  logger.debug({ eventId: event.eventId }, 'Event processed and marked');
}

/**
 * In-memory idempotency store — for testing only.
 * Production services use a PostgreSQL `processed_events` table.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly seen = new Set<string>();

  async has(eventId: string): Promise<boolean> {
    return this.seen.has(eventId);
  }

  async mark(eventId: string): Promise<void> {
    this.seen.add(eventId);
  }
}
