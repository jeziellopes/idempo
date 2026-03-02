/** Kafka topic names — single source of truth */
export const TOPICS = {
  PLAYER_ACTIONS: 'player-actions',
  MATCH_EVENTS: 'match-events',
  ECONOMY_EVENTS: 'economy-events',
  LEADERBOARD_EVENTS: 'leaderboard-events',
  // Dead-letter queues
  PLAYER_ACTIONS_DLQ: 'player-actions.dlq',
  MATCH_EVENTS_DLQ: 'match-events.dlq',
  ECONOMY_EVENTS_DLQ: 'economy-events.dlq',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];
