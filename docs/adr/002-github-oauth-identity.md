# ADR-002 — GitHub OAuth Identity Service

**Date:** 2026-03-10  
**Status:** Accepted  
**Deciders:** idempo core team  
**Related:** [ADR-001 — Monorepo](001-monorepo.md) · [SPEC.md](../SPEC.md) · [API.md](../API.md)

---

## Context

The original auth implementation used a single shared password (`"idempo"`) that all players sent with every login request. The gateway minted a JWT whose `sub` claim was the **username the player typed**, meaning:

1. Any player could impersonate any other player by simply typing their username.
2. The `playerId` was generated **client-side** with `uuidv4()` — a different UUID per session, so the same GitHub user had a different leaderboard identity every time they opened a browser.
3. The RUNBOOK required operators to remember and share a plaintext password.

For idempo to be a useful engineering reference, the auth layer needs to demonstrate production-grade OAuth and server-authoritative identity — the same patterns a real multi-service backend would use.

### Forces

- **Developer experience first** — "make it easy for developers to authenticate and have a unique username on the leaderboard"
- Must work without a frontend redirect loop during automated E2E testing
- `playerId` must be **stable** across sessions (same GitHub user → same UUID forever)
- Identity must be **server-authoritative** — downstream services must not trust client-supplied player IDs
- No external identity provider SLA dependency during local development tests (needs a bypass endpoint)

---

## Decision

**Introduce a dedicated `identity-service` (NestJS, port 3010) that owns user identity and issues httpOnly JWT cookies via GitHub OAuth 2.0.**

Key design choices:

| Decision | Rationale |
|---|---|
| GitHub OAuth as sole provider | Developers already have GitHub accounts; no signup friction; `github_login` becomes the leaderboard username naturally |
| httpOnly cookies instead of `localStorage` | Eliminates XSS token theft vector; standard SameSite=Lax prevents most CSRF; `credentials: 'include'` on fetch calls handles forwarding transparently |
| Stable server-assigned `playerId` (UUID) | Stored in `identity_db.users` on first login; the same UUID is used forever → leaderboard continuity across sessions |
| JTI-based refresh token rotation | `refresh_tokens` table stores the JTI UUID as `token_hash`; on each `/auth/refresh`, the old JTI is atomically revoked and a new one issued — single-use tokens without bcrypt overhead |
| Gateway strips and re-injects identity headers | `ProxyController.forwardAuthenticated()` removes any client-supplied `X-Player-Id`/`X-Username` headers then injects them from the verified JWT payload — downstream services cannot be spoofed |
| `POST /auth/test-token` bypass | Disabled in production (`NODE_ENV=production`); allows E2E tests and local scripts to obtain a valid cookie without going through the GitHub OAuth browser flow |

---

## Architecture

```
Browser / CLI
    │
    ▼
API Gateway (:3001)                      identity-service (:3010)
  AuthProxyController                       AuthController
  (no JWT guard, public passthrough)           ├── GET  /api/auth/github        → GitHub redirect
    │  ──── /api/auth/** ────────────────────► ├── GET  /api/auth/github/callback → set cookies
    │                                           ├── POST /api/auth/refresh        → rotate JTI
  ProxyController                              ├── GET  /api/auth/me             → UserDto
  (JwtAuthGuard)                               ├── POST /api/auth/logout         → revoke + clear
    │  extracts JWT from accessToken cookie    └── POST /api/auth/test-token     → dev bypass
    │  strips X-Player-Id / X-Username
    │  injects from JWT payload
    ▼
  Downstream services (game-service, leaderboard-service, …)
    read X-Player-Id and X-Username headers only — never trust req.body identity
```

---

## Database Schema (`identity_db`)

```sql
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id    BIGINT UNIQUE NOT NULL,
  github_login VARCHAR(80) UNIQUE NOT NULL,  -- becomes username
  display_name VARCHAR(120),
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,  -- JTI UUID (not bcrypt; UUID is not a credential)
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Consequences

### Positive

- **No more shared password** — credential exposure risk eliminated.
- **Stable `playerId`** — leaderboard entries persist across sessions; players can bookmark their rank.
- **Server-authoritative identity** — game service and leaderboard service cannot be fed a fake player ID; the gateway is the single enforcement point.
- **Cookie security** — `httpOnly; SameSite=lax` means the token is never accessible to JavaScript; XSS cannot steal sessions.
- **Clean separation of concerns** — identity-service is the only service that knows about GitHub OAuth tokens; all other services see only `X-Player-Id` / `X-Username` headers.
- **Testable** — `POST /auth/test-token` lets CI pipelines authenticate in < 50 ms without any browser.

### Negative / Trade-offs

- **Extra microservice** — adds one more container to `docker compose up`; local startup is slightly slower.
- **Identity DB** — a new Postgres instance (`identity_db`) is required; one more schema to migrate.
- **Requires GitHub OAuth app credentials** — `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` must be set for real OAuth to work; the test-token bypass covers local dev without them.
- **Cookie + CORS complexity** — `credentials: 'include'` on every `fetch` call, `SameSite=Lax` requires same-origin or explicit CORS `allow-origin` + `allow-credentials` headers on the gateway.

---

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Keep shared password, but hash it | Still a shared secret; no real identity (same password for all users); leaderboard username still user-supplied (spoofable) |
| JWT in `Authorization: Bearer` header stored in localStorage | XSS-accessible; requires frontend to manage token lifecycle explicitly |
| Magic link (email) auth | Requires email infrastructure; not developer-friendly for a local demo; adds SMTP dependency |
| Auth0 / Clerk external provider | SaaS dependency; breaks offline / air-gapped development; adds billing concern |
| Per-service JWT validation | Spreads auth concern across every service; no central revocation; harder to audit |
