/**
 * Iteration 1 E2E — Playable Arena
 *
 * Prerequisites: `docker compose up -d --build` with all containers healthy.
 *
 * Run:
 *   API_URL=http://localhost:3001 nx run e2e:e2e --testFile=iter1.e2e.ts
 *
 * Covers:
 *  1. Authentication via test-token bypass → httpOnly cookie
 *  2. Match creation (identity comes from cookie JWT injected by gateway)
 *  3. Second player joins (separate token, separate cookie)
 *  4. Stamp-sealed action submission (core idempotency mechanic)
 *  5. Replay of the same idempotency key → cached response, no re-execution
 *  6. Leaderboard endpoint reachable and returns expected shape
 */

const API = process.env['API_URL'] ?? 'http://localhost:3001';

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function post<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

async function get<T>(
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, { headers });
  return { status: res.status, body: (await res.json()) as T };
}

/**
 * Exchange a playerId + username for an httpOnly accessToken cookie via the
 * identity-service test-token bypass endpoint (disabled in production).
 * Returns the raw Cookie header string ready for use in subsequent requests.
 */
async function obtainTestCookie(playerId: string, username: string): Promise<string> {
  const res = await fetch(`${API}/api/auth/test-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, username }),
  });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/accessToken=([^;,\s]+)/);
  expect(match).toBeTruthy();
  return `accessToken=${match![1]}`;
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('Iteration 1 — Playable Arena', () => {
  // Shared state built up across tests in declaration order.
  let cookie1: string; // player1's accessToken cookie
  let cookie2: string; // player2's accessToken cookie
  let matchId: string;

  // Use valid UUIDs for player IDs (required by postgres uuid column type)
  const player1 = { playerId: crypto.randomUUID(), username: `Player1-${Date.now()}` };
  const player2 = { playerId: crypto.randomUUID(), username: `Player2-${Date.now()}` };

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  it('POST /api/auth/test-token → sets accessToken cookies for both players', async () => {
    cookie1 = await obtainTestCookie(player1.playerId, player1.username);
    cookie2 = await obtainTestCookie(player2.playerId, player2.username);

    expect(cookie1).toMatch(/^accessToken=.{20,}/);
    expect(cookie2).toMatch(/^accessToken=.{20,}/);
    expect(cookie1).not.toBe(cookie2);
  });

  // ── 2. Match creation ────────────────────────────────────────────────────────
  it('POST /api/matches → creates a match (identity from cookie JWT, not body)', async () => {
    // No playerId/username in body — gateway reads identity from the JWT cookie
    const { status, body } = await post<{ matchId: string; status: string }>(
      '/api/matches',
      {},
      { Cookie: cookie1 },
    );
    expect(status).toBe(201);
    expect(typeof body.matchId).toBe('string');
    matchId = body.matchId;
  });

  // ── 3. Join ──────────────────────────────────────────────────────────────────
  it('POST /api/matches/:id/join → second player joins using their own cookie', async () => {
    const { status } = await post(
      `/api/matches/${matchId}/join`,
      {},
      { Cookie: cookie2 },
    );
    // 200 or 201 are both acceptable join responses.
    expect(status).toBeLessThan(300);
  });

  // ── 4. Stamp-sealed action ───────────────────────────────────────────────────
  it('POST /api/matches/:id/actions with X-Idempotency-Key → action accepted', async () => {
    const actionId = crypto.randomUUID();

    const { status, body } = await post<{ accepted: boolean; duplicate: boolean }>(
      `/api/matches/${matchId}/actions`,
      // playerId is no longer in the body — gateway injects it from the JWT cookie
      { actionType: 'attack', payload: { targetId: player2.playerId }, useStamp: true },
      { Cookie: cookie1, 'X-Idempotency-Key': actionId },
    );

    expect(status).toBe(202);
    expect(body.accepted).toBe(true);
    expect(body.duplicate).toBe(false);
  });

  // ── 5. Idempotency replay ────────────────────────────────────────────────────
  it('replaying the same X-Idempotency-Key returns the cached response unchanged', async () => {
    const actionId = crypto.randomUUID();
    const payload = { actionType: 'attack', payload: { targetId: player2.playerId }, useStamp: true };
    const authHeaders = { Cookie: cookie1, 'X-Idempotency-Key': actionId };

    // First submission — processed normally.
    const first = await post<{ accepted: boolean; duplicate: boolean }>(
      `/api/matches/${matchId}/actions`,
      payload,
      authHeaders,
    );
    expect(first.status).toBe(202);

    // Replay — same X-Idempotency-Key → game-service idempotency layer returns
    // duplicate:true without re-executing the action.
    const replay = await post<{ accepted: boolean; duplicate: boolean }>(
      `/api/matches/${matchId}/actions`,
      payload,
      authHeaders,
    );

    expect(replay.status).toBe(first.status);
    expect(replay.body.accepted).toBe(true);
    expect(replay.body.duplicate).toBe(true);
  });

  // ── 6. Leaderboard ───────────────────────────────────────────────────────────
  it('GET /api/leaderboard → reachable, returns { entries: [] }', async () => {
    const { status, body } = await get<{ entries: unknown[]; meta: unknown }>(
      '/api/leaderboard',
      { Cookie: cookie1 },
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.entries)).toBe(true);
  });
});
