import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { setupAuthenticatedPage } from './fixtures';

test.describe('Arena Combat Flow', () => {
  let context: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    context = await playwright.request.newContext();
  });

  test.afterAll(async () => {
    await context.dispose();
  });

  test('should create match and enter arena successfully', async ({ page }) => {
    // Setup: Authenticate and inject cookie
    await setupAuthenticatedPage(page, context);

    // Navigate to lobby — identity comes from the JWT cookie, no username input needed
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find Match button should be visible once the session check resolves
    await page.locator('button:has-text("Find Match")').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('button:has-text("Find Match")').click();

    // Wait for redirect to arena URL
    await page.waitForURL(/\/arena\/\w+/);
    const arenaUrl = page.url();
    expect(arenaUrl).toMatch(/\/arena\//);

    // Wait for arena content to load - check for status badge first
    const statusBadge = page.locator('span[class*="bg-yellow-900"], span[class*="bg-green-900"]');
    await expect(statusBadge).toBeVisible({ timeout: 10000 });

    // Verify Action Panel and Players section exist (use h3, not h2)
    await expect(page.locator('h3:has-text("Actions")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('h3:has-text("Players")')).toBeVisible({ timeout: 5000 });

    // Verify stamp display
    const stampDisplay = page.locator('text=/🔖 Stamps:/').first();
    await expect(stampDisplay).toBeVisible();
  });

  test('should render arena page with action panel', async ({ page }) => {
    // Setup: Authenticate and inject cookie
    await setupAuthenticatedPage(page, context);

    // Navigate to arena via lobby — username comes from the JWT cookie
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('button:has-text("Find Match")').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('button:has-text("Find Match")').click();

    // Wait for arena
    await page.waitForURL(/\/arena\/\w+/);
    await page.waitForLoadState('networkidle');

    // Verify action buttons are present (even if disabled)
    await expect(page.locator('button:has-text("Attack")')).toBeVisible();
    await expect(page.locator('button:has-text("Defend")')).toBeVisible();
    await expect(page.locator('button:has-text("Collect")')).toBeVisible();

    // Verify page remains stable
    await expect(page.locator('main')).toBeVisible();
  });
});
