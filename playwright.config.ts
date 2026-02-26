import { defineConfig } from '@playwright/test';

/**
 * Playwright config for Electron E2E tests.
 *
 * Tests launch the Electron app in demo mode (no hardware required).
 * Build the app first: `npm run build:e2e`, then run: `npm run test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1, // Electron tests must run sequentially (single app instance)
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: 'e2e-results',
});
