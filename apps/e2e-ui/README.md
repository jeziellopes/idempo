# e2e-ui — Browser-Based End-to-End Tests

Playwright-based e2e tests for the idempo web UI. Tests validate user flows from login through arena combat and leaderboard access.

**Prerequisites:** docker compose must be running with all services healthy.

## Running Tests

### All tests (headless)
```bash
pnpm nx run e2e-ui:e2e
```

### Specific test file
```bash
pnpm nx run e2e-ui:e2e -- --grep="Arena Combat"
```

### Headed mode (see browser automation)
```bash
pnpm nx run e2e-ui:e2e -- --headed
```

### Debug mode (interactive playwright inspector)
```bash
pnpm nx run e2e-ui:e2e -- --debug
```

### Watch mode (re-run on file changes)
```bash
pnpm nx run e2e-ui:e2e -- --watch
```

## Test Coverage

### arena.spec.ts
- **Arena Combat Flow:** Lobby → match creation → WebSocket join → status progression (PENDING→ACTIVE) → action submission
- **Idempotency Test:** Submit same action twice, verify stamps spent only once

### leaderboard.spec.ts
- **Leaderboard Display:** Verify table renders with rank, username, score columns
- **Score Updates:** Complete match and verify entry appears in leaderboard
- **Auto-Refresh:** Confirm leaderboard refreshes periodically (10s interval)

## Authentication

Tests use the temporary auto-authentication approach:
- Username + hardcoded password "idempo" → automatic JWT token generation
- Token stored in localStorage and included in API requests
- Production auth flow (signup, login UI) will be implemented in a future iteration

## Test Results

After running, view detailed results:
```bash
# Open HTML report
open playwright-report/index.html

# Check test-results/ for screenshots/videos on failure
ls test-results/
```

## Debugging Failed Tests

1. **Increase timeout:** Some tests wait for WebSocket events (60s timeout currently)
2. **Run headed:** See what the browser is doing
3. **Check API responses:** Verify backend services are healthy
4. **Screenshot on failure:** Automatically captured in test-results/

## Configuration

See [playwright.config.ts](playwright.config.ts) for:
- Base URL and timeouts
- Screenshot/video capture settings
- Browser selection (Chromium only for now)
- Retry and parallelization settings
