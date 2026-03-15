// Use a relative path so all API calls go through the Next.js server-side
// rewrite (next.config rewrites /api/* → API gateway). This means a single
// public hostname works for both the UI and the API, which fixes OAuth
// callback routing when behind ngrok or a reverse proxy.
const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '/api';

/**
 * Generic fetch wrapper.
 * - Always sends cookies (credentials: 'include') so the httpOnly accessToken
 *   cookie is forwarded to the API gateway on every request.
 * - On 401, redirects to /signin (client-side only) so the user re-authenticates
 *   via GitHub OAuth rather than seeing a raw error.
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/signin';
      // Returning a never-resolving promise prevents the caller from handling
      // a stale 401 error while the navigation is in progress.
      return new Promise<never>(() => undefined);
    }
    const body = await res.text();
    throw new Error(`API ${options?.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface UserDto {
  playerId: string;
  username: string;
  avatarUrl?: string;
}

export interface CreateMatchResponse {
  matchId: string;
  status: string;
  wsToken: string;
}

export interface ActionResponse {
  accepted: boolean;
  duplicate: boolean;
}

export interface LeaderboardEntry {
  playerId: string;
  username: string;
  score: number;
  rank: number;
  updatedAt: string;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  meta: { stale: boolean; count: number };
}

export const api = {
  /**
   * Returns the current user's identity from the access token cookie.
   * Throws (→ redirects to /signin) if the cookie is absent or expired.
   */
  getMe: () => request<UserDto>('/auth/me'),

  /**
   * Creates or joins a match. Player identity is NOT sent in the body —
   * the API Gateway injects X-Player-Id / X-Username from the verified JWT.
   */
  createMatch: () =>
    request<CreateMatchResponse>('/matches', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  /**
   * Submits a game action. playerId is resolved server-side from the JWT,
   * not from the request body.
   */
  submitAction: (
    matchId: string,
    actionType: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    useStamp: boolean,
  ) =>
    request<ActionResponse>(`/matches/${matchId}/actions`, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ actionType, payload, useStamp }),
    }),

  getLeaderboard: () => request<LeaderboardResponse>('/leaderboard'),

  getOpenMatches: () =>
    request<Array<{ id: string; status: string; playerCount: number; hasBots: boolean }>>('/matches/open'),
};
