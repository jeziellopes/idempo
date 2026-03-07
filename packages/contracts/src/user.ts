/**
 * Shared user / identity types used across the network boundary:
 *  - identity-service → api-gateway (JWT payload)
 *  - api-gateway      → downstream services (X-Player-Id / X-Username headers)
 *  - web frontend     → store hydration via GET /auth/me
 */

/** Stable player identity returned by GET /auth/me. */
export interface UserDto {
  /** Stable UUID assigned on first GitHub sign-in. Used as playerId throughout. */
  playerId: string;
  /** GitHub login (github_login) — unique, used as in-game username. */
  username: string;
  avatarUrl?: string;
}

/**
 * Shape of the data encoded inside access JWTs.
 * sub = users.id (UUID) — NOT the GitHub username.
 */
export interface JwtPayload {
  /** users.id UUID — the stable, server-assigned player identity. */
  sub: string;
  /** GitHub login — copy of github_login at token-issue time. */
  username: string;
  iat?: number;
  exp?: number;
}
