/**
 * Iteration 1 E2E — Playable Arena
 *
 * Prerequisites: `docker compose up -d --build` with all containers healthy.
 *
 * Run:
 *   API_URL=http://localhost:3001 nx run e2e:e2e --testFile=iter1.e2e.ts
 *
 * Covers:
 *  1. Authentication → JWT
 *  2. Match creation
 *  3. Second player joins
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

// ── Suite ────────────────────────────────────────────────────────────────────

describe('Iteration 1 — Playable Arena', () => {
  // Shared state built up across tests in declaration order.
  let jwt: string;
  let matchId: string;

  // Use valid UUIDs for player IDs (required by postgres uuid column type)
  const player1 = { playerId: crypto.randomUUID(), username: `Player1-${Date.now()}` };
  const player2 = { playerId: crypto.randomUUID(), username: `Player2-${Date.now()}` };

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  it('POST /api/auth/login → returns a JWT accessToken', async () => {
    const { status, body } = await post<{ accessToken: string }>(
      '/api/auth/login',
      { username: player1.username, password: 'idempo' },
    );
    expect(status).toBe(200);
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.length).toBeGreaterThan(10);
    jwt = body.accessToken;
  });

  // ── 2. Match creation ────────────────────────────────────────────────────────
  it('POST /api/matches → creates a match and returns matchId', async () => {
    const { status, body } = await post<{ matchId: string; status: string }>(
      '/api/matches',
      { playerId: player1.playerId, username: player1.username },
      { Authorization: `Bearer ${jwt}` },
    );
    expect(status).toBe(201);
    expect(typeof body.matchId).toBe('string');
    matchId = body.matchId;
  });

  // ── 3. Join ──────────────────────────────────────────────────────────────────
  it('POST /api/matches/:id/join → second player joins successfully', async () => {
    const { status } = await post(
      `/api/matches/${matchId}/join`,
      { playerId: player2.playerId, username: player2.username },
      { Authorization: `Bearer ${jwt}` },
    );
    // 200 or 201 are both acceptable join responses.
    expect(status).toBeLessThan(300);
  });

  // ── 4. Stamp-sealed action ───────────────────────────────────────────────────
  it('POST /api/matches/:id/actions with X-Idempotency-Key → action accepted', async () => {
    const actionId = crypto.randomUUID();

    const { status, body } = await post<{ accepted: boolean; duplicate: boolean }>(
      `/api/matches/${matchId}/actions`,
      { actionType: 'attack', playerId: player1.playerId, payload: { targetId: player2.playerId }, useStamp: true },
      { Authorization: `Bearer ${jwt}`, 'X-Idempotency-Key': actionId },
    );

    expect(status).toBe(202);
    expect(body.accepted).toBe(true);
    expect(body.duplicate).toBe(false);
  });

  // ── 5. Idempotency replay ────────────────────────────────────────────────────
  it('replaying the same X-Idempotency-Key returns the cached response unchanged', async () => {
    const actionId = crypto.randomUUID();
    const payload = { actionType: 'attack', playerId: player1.playerId, payload: { targetId: player2.playerId }, useStamp: true };
    const authHeaders = { Authorization: `Bearer ${jwt}`, 'X-Idempotency-Key': actionId };

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
      { Authorization: `Bearer ${jwt}` },
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.entries)).toBe(true);
  });
});
