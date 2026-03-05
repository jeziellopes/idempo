import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { setupAuthenticatedPage } from './fixtures';

test.describe('Leaderboard UI', () => {
  let context: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    context = await playwright.request.newContext();
  });

  test.afterAll(async () => {
    await context.dispose();
  });

  test('should display leaderboard page with heading', async ({ page }) => {
    // Setup: Authenticate and inject token
    await setupAuthenticatedPage(page, context);

    // Navigate to leaderboard
    await page.goto('/leaderboard');

    // Wait for heading to appear
    const heading = page.locator('h2:has-text("Global Leaderboard")');
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete by checking that "Loading…" text is gone
    const loadingText = page.getByText('Loading…');
    await loadingText.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {
      // Loading text might not appear at all if data loads quickly
    });

    // Verify either table or "No entries yet" message is visible
    const table = page.locator('table');
    const noEntries = page.locator('text=No entries yet');
    
    const tableExists = await table.isVisible({ timeout: 1000 }).catch(() => false);
    const noEntriesExists = await noEntries.isVisible({ timeout: 1000 }).catch(() => false);
    
    expect(tableExists || noEntriesExists).toBe(true);
  });

  test('should load leaderboard after arena visit', async ({ page }) => {
    // Setup: Authenticate and inject token
    await setupAuthenticatedPage(page, context);

    // Navigate to arena first
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const usernameInput = page.locator('input[placeholder*="username"]');
    await usernameInput.fill(`LeaderboardTest-${Date.now()}`);

    const findMatchButton = page.locator('button:has-text("Find Match")');
    await findMatchButton.click();

    // Wait for arena
    await page.waitForURL(/\/arena\/\w+/);

    // Now navigate to leaderboard
    await page.goto('/leaderboard');

    // Wait for heading to be visible
    await page.locator('h2:has-text("Global Leaderboard")').waitFor({ state: 'visible', timeout: 10000 });

    // Verify page is responsive
    const heading = page.locator('h2:has-text("Global Leaderboard")');
    await expect(heading).toBeVisible();
  });

  test('should maintain leaderboard page responsiveness', async ({ page }) => {
    // Setup: Authenticate and inject token
    await setupAuthenticatedPage(page, context);

    // Navigate to leaderboard
    await page.goto('/leaderboard');

    // Wait for page to load
    await page.locator('h2:has-text("Global Leaderboard")').waitFor({ state: 'visible', timeout: 10000 });

    // Verify heading is visible
    const heading = page.locator('h2:has-text("Global Leaderboard")');
    await expect(heading).toBeVisible();

    // Wait a few seconds
    await page.waitForTimeout(5000);

    // Verify page is still responsive (heading still visible)
    await expect(heading).toBeVisible();
  });
});
