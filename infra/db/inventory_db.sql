-- inventory_db schema

CREATE TABLE items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL,
  item_type    VARCHAR(60) NOT NULL,
  metadata     JSONB,
  locked       BOOLEAN NOT NULL DEFAULT false,  -- locked during active trade saga
  locked_by    UUID,                             -- tradeId holding the lock
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_items_player ON items (player_id);
CREATE INDEX idx_items_type ON items (item_type);
CREATE INDEX idx_items_locked ON items (locked) WHERE locked = true;

-- Kafka consumer idempotency store
CREATE TABLE processed_events (
  event_id     UUID PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
