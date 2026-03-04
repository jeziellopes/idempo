import { Page, APIRequestContext } from '@playwright/test';

/**
 * Auth fixture: Direct API login and JWT injection into browser storage.
 * This bypasses the UI login flow for faster, more reliable test setup.
 */
export async function setupAuthenticatedPage(
  page: Page,
  context: APIRequestContext,
  username: string = 'playwright-test',
  password: string = 'idempo'
): Promise<{ page: Page; token: string }> {
  // Step 1: Login via API to get JWT token
  const loginResponse = await context.post('http://localhost:3001/api/auth/login', {
    data: { username, password },
  });

  if (!loginResponse.ok()) {
    throw new Error(`Login failed: ${loginResponse.status()}`);
  }

  const { accessToken } = await loginResponse.json();

  // Step 2: Inject token into browser localStorage
  await page.addInitScript((token) => {
    localStorage.setItem('authToken', token);
  }, accessToken);

  return { page, token: accessToken };
}
