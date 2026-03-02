-- marketplace_db schema (SPEC.md §4.3)

CREATE TABLE listings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   UUID NOT NULL,
  item_id     UUID NOT NULL,
  price       BIGINT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | SOLD | CANCELLED
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT listings_status_check CHECK (status IN ('ACTIVE', 'SOLD', 'CANCELLED')),
  CONSTRAINT listings_price_positive CHECK (price > 0)
);

CREATE INDEX idx_listings_seller ON listings (seller_id);
CREATE INDEX idx_listings_item ON listings (item_id);
CREATE INDEX idx_listings_status ON listings (status);

CREATE TABLE trades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID NOT NULL REFERENCES listings(id),
  buyer_id    UUID NOT NULL,
  seller_id   UUID NOT NULL,
  item_id     UUID NOT NULL,
  price       BIGINT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING | COMPLETED | FAILED
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trades_status_check CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX idx_trades_buyer ON trades (buyer_id);
CREATE INDEX idx_trades_seller ON trades (seller_id);

-- Saga state machine (SPEC.md §6.1)
CREATE TABLE saga_log (
  trade_id    UUID PRIMARY KEY,
  state       VARCHAR(40) NOT NULL,
  payload     JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kafka consumer idempotency store
CREATE TABLE processed_events (
  event_id     UUID PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
