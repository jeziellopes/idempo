-- wallet_db schema (SPEC.md §4.2)

CREATE TABLE wallets (
  player_id      UUID PRIMARY KEY,
  balance        BIGINT NOT NULL DEFAULT 0,          -- minor units (cents)
  held_amount    BIGINT NOT NULL DEFAULT 0,           -- funds reserved for pending trades
  stamp_balance  INT NOT NULL DEFAULT 0,              -- idempo Stamps available in-arena
  version        INT NOT NULL DEFAULT 0,              -- optimistic lock version
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0),
  CONSTRAINT wallets_held_non_negative CHECK (held_amount >= 0),
  CONSTRAINT wallets_stamps_non_negative CHECK (stamp_balance >= 0)
);

-- Append-only ledger — never UPDATE or DELETE
CREATE TABLE transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL,
  amount       BIGINT NOT NULL,                      -- positive = credit, negative = debit
  type         VARCHAR(30) NOT NULL,                 -- REWARD | TRADE_HOLD | TRADE_RELEASE | TRADE_DEBIT | TRADE_CREDIT
  reference_id UUID,                                 -- saga tradeId or reward eventId
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_player ON transactions (player_id);
CREATE INDEX idx_transactions_reference ON transactions (reference_id);

-- Kafka consumer idempotency store
CREATE TABLE processed_events (
  event_id     UUID PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
