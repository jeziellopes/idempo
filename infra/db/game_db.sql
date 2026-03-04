-- game_db schema (SPEC.md §4.1)

CREATE TABLE matches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING | ACTIVE | FINISHED
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matches_status_check CHECK (status IN ('PENDING', 'ACTIVE', 'FINISHED'))
);

CREATE TABLE match_players (
  match_id     UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id    UUID NOT NULL,
  username     VARCHAR(80) NOT NULL,
  hp           INT NOT NULL DEFAULT 100,
  score        INT NOT NULL DEFAULT 0,
  resources    INT NOT NULL DEFAULT 0,
  shields      INT NOT NULL DEFAULT 0,
  position_x   INT NOT NULL DEFAULT 0,
  position_y   INT NOT NULL DEFAULT 0,
  alive        BOOLEAN NOT NULL DEFAULT true,
  team         SMALLINT,
  final_score  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id)
);

-- Idempotency anchor — action_id is the X-Idempotency-Key / Stamp UUID
CREATE TABLE player_actions (
  action_id    UUID PRIMARY KEY,                         -- UNIQUE enforced by PK
  match_id     UUID NOT NULL REFERENCES matches(id),
  player_id    UUID NOT NULL,
  action_type  VARCHAR(30) NOT NULL,
  payload      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_player_actions_match ON player_actions (match_id);
CREATE INDEX idx_player_actions_player ON player_actions (player_id);
CREATE INDEX idx_match_players_player ON match_players (player_id);
