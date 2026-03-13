import type { Page, APIRequestContext } from '@playwright/test';

/**
 * Auth fixture: Obtains an httpOnly accessToken cookie via the identity-service
 * test-token bypass endpoint and injects it into the browser page context.
 *
 * This avoids the real GitHub OAuth flow for automated tests while keeping
 * the same cookie-based auth path used in production.
 *
 * NOTE: The test-token endpoint is disabled in production (NODE_ENV=production).
 */
export async function setupAuthenticatedPage(
  page: Page,
  context: APIRequestContext,
  username: string = `playwright-${Date.now()}`,
): Promise<{ page: Page }> {
  const playerId = crypto.randomUUID();

  // Step 1: Exchange playerId + username for an accessToken cookie
  const response = await context.post('http://localhost:3001/api/auth/test-token', {
    data: { playerId, username },
  });

  if (!response.ok()) {
    throw new Error(
      `test-token request failed with status ${response.status()}. ` +
      'Ensure identity-service is running and NODE_ENV != "production".',
    );
  }

  // Step 2: Extract the accessToken value from the Set-Cookie header
  // Playwright's APIRequestContext returns headers as a flat object; set-cookie
  // may be a single string containing one or more cookies.
  const setCookieHeader = response.headers()['set-cookie'] ?? '';
  const cookieMatch = setCookieHeader.match(/accessToken=([^;,\s]+)/);
  if (!cookieMatch) {
    throw new Error(
      'accessToken cookie not found in test-token response Set-Cookie header. ' +
      `Received: ${setCookieHeader || '(empty)'}`,
    );
  }

  // Step 3: Inject the cookie into the browser context so it is sent
  // automatically with every request to the API gateway.
  await page.context().addCookies([
    {
      name: 'accessToken',
      value: cookieMatch[1],
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return { page };
}
