-- leaderboard_db schema (SPEC.md §4.4)
-- Note: the primary read path is Redis (leaderboard:top100 sorted set, TTL 60s).
-- This table is the CQRS write model / projection for persistence.

CREATE TABLE ranking_projection (
  player_id   UUID PRIMARY KEY,
  username    VARCHAR(60) NOT NULL,
  score       BIGINT NOT NULL DEFAULT 0,
  rank        INT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ranking_score ON ranking_projection (score DESC);
