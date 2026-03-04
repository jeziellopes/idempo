const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${options?.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
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
  createMatch: (playerId: string, username: string) =>
    request<CreateMatchResponse>('/matches', {
      method: 'POST',
      body: JSON.stringify({ playerId, username }),
    }),

  submitAction: (
    matchId: string,
    playerId: string,
    actionType: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    useStamp: boolean,
  ) =>
    request<ActionResponse>(`/matches/${matchId}/actions`, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ playerId, actionType, payload, useStamp }),
    }),

  getLeaderboard: () => request<LeaderboardResponse>('/leaderboard'),
};
