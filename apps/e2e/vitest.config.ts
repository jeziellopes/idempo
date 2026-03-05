import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.e2e.ts'],
    // E2E calls a live stack — longer timeouts than unit tests.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run test files sequentially to avoid inter-test infra interference.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
