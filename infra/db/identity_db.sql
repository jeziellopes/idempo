-- ─── Identity Service Database ───────────────────────────────────────────────
-- Stores GitHub OAuth user accounts and refresh token rotation table.
-- player_id (users.id UUID) is the stable, server-assigned identity that flows
-- through the entire system (game service, leaderboard, wallet, etc.).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── users ────────────────────────────────────────────────────────────────────
-- One row per GitHub account. Created on first OAuth callback; updated on
-- subsequent logins if display_name or avatar_url changes.
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id     BIGINT      NOT NULL UNIQUE,
  github_login  VARCHAR(80) NOT NULL UNIQUE,   -- GitHub username (used as in-game username)
  display_name  VARCHAR(120),
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_github_id_idx ON users (github_id);

-- ─── refresh_tokens ───────────────────────────────────────────────────────────
-- Enables token rotation and server-side revocation (logout invalidates the
-- row; a revoked/expired token can never be replayed).
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,   -- bcrypt hash of the raw refresh token
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,                   -- NULL = still valid
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx  ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx     ON refresh_tokens (token_hash);
