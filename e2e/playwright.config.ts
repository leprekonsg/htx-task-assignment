// End-to-end tests run against the real stack (nginx + API + Postgres + optional Gemini), exactly as a reviewer
// would run it: `docker compose up --build`. `npm run test:e2e` starts Compose itself unless E2E_BASE_URL points
// at an already-running instance. Browsers: chromium only — this is a smoke suite, not a compatibility matrix.
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Read the repo's .env (same file Compose uses) so specs know whether skill inference is enabled.
try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  /* no .env — inference assertions relax to "either outcome" */
}

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './tests',
  // Both default to the package.json directory (the repo root); keep everything Playwright writes under e2e/.
  outputDir: './test-results',
  // Removes this suite's own fixture tasks (titles carry an `[e2e ` marker) after the run — see the
  // header comment in global-teardown.ts for why the delete is scoped that way and why it never fails.
  globalTeardown: './global-teardown.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // tests share one database; they use unique titles but run serially to keep logs readable
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: './playwright-report' }]]
    : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'docker compose up --build',
        url: `${baseURL}/api/health`,
        reuseExistingServer: true,
        timeout: 240_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
