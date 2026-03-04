import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for browser-based e2e tests.
 * Tests run against localhost:3000 (Next.js web app running in Docker).
 * Prerequisites: docker compose up -d (all services healthy)
 */
export default defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : 1,
  timeout: 60 * 1000, // 60s timeout for WebSocket events
  expect: {
    timeout: 10 * 1000, // 10s for individual assertions
  },
  reporter: [['html'], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'echo "Web server must be running (docker compose up -d)"',
    port: 3000,
    reuseExistingServer: true,
    timeout: 10 * 1000,
  },
});
