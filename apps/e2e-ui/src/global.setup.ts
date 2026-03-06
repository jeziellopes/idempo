import type { FullConfig } from '@playwright/test';

const CHECKS = [
  { name: 'web', url: 'http://localhost:3000/', expectedStatuses: [200] },
  { name: 'api-gateway', url: 'http://localhost:3001/api/health', expectedStatuses: [200] },
  { name: 'game-service', url: 'http://localhost:3002/api/matches/preflight-not-found', expectedStatuses: [404] },
  { name: 'leaderboard-service', url: 'http://localhost:3005/api/leaderboard', expectedStatuses: [200] },
];

async function waitForHealthy(name: string, url: string, expectedStatuses: number[], timeoutMs: number): Promise<void> {
  const start = Date.now();
  let lastError = 'unknown error';

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (expectedStatuses.includes(response.status)) {
        return;
      }
      lastError = `HTTP ${response.status} (expected ${expectedStatuses.join(',')})`;
    } catch (error) {
      lastError = (error as Error).message;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`Timeout waiting for ${name} at ${url}. Last error: ${lastError}`);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const timeoutMs = 120_000;

  for (const check of CHECKS) {
    await waitForHealthy(check.name, check.url, check.expectedStatuses, timeoutMs);
  }
}
