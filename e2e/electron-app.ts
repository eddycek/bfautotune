/**
 * Electron app fixture for Playwright E2E tests.
 *
 * Launches the built Electron app in demo mode and provides
 * convenience helpers for common operations.
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/** Default timeout for waiting on UI elements (ms) */
const UI_TIMEOUT = 30_000;

/** Timeout for operations that involve analysis (FFT, step response) */
const ANALYSIS_TIMEOUT = 60_000;

export interface DemoApp {
  app: ElectronApplication;
  page: Page;
  /** Take a named screenshot and save to e2e-screenshots/ */
  screenshot(name: string): Promise<void>;
  /** Wait for text to appear on page */
  waitForText(text: string | RegExp, timeout?: number): Promise<void>;
  /** Wait for a button with given text and click it */
  clickButton(text: string | RegExp, timeout?: number): Promise<void>;
  /** Wait for demo auto-connect to complete (profile loaded) */
  waitForDemoReady(): Promise<void>;
  /** Wait for a tuning phase transition */
  waitForPhase(phaseText: string, timeout?: number): Promise<void>;
  /** Close the app */
  close(): Promise<void>;
}

/**
 * Launch the Electron app in demo mode.
 *
 * Requires the app to be built first (`npm run build:e2e`).
 * Returns a DemoApp instance with convenience helpers.
 */
export async function launchDemoApp(): Promise<DemoApp> {
  const appPath = path.resolve(__dirname, '..');
  const userDataDir = path.join(appPath, '.e2e-userdata');

  // Wipe user data directory to ensure clean state for each test file
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });

  // Ensure screenshots directory exists
  fs.mkdirSync(path.join(appPath, 'e2e-screenshots'), { recursive: true });

  const app = await electron.launch({
    args: [appPath],
    env: {
      ...process.env,
      DEMO_MODE: 'true',
      // Use a separate userData dir for E2E to avoid polluting dev data
      E2E_USER_DATA_DIR: userDataDir,
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('load');

  const demoApp: DemoApp = {
    app,
    page,

    async screenshot(name: string) {
      await page.screenshot({
        path: path.join(appPath, 'e2e-screenshots', `${name}.png`),
        fullPage: true,
      });
    },

    async waitForText(text: string | RegExp, timeout = UI_TIMEOUT) {
      if (typeof text === 'string') {
        await page.getByText(text).first().waitFor({ state: 'visible', timeout });
      } else {
        await page.getByText(text).first().waitFor({ state: 'visible', timeout });
      }
    },

    async clickButton(text: string | RegExp, timeout = UI_TIMEOUT) {
      const button = page.getByRole('button', { name: text });
      await button.waitFor({ state: 'visible', timeout });
      await button.click();
    },

    async waitForDemoReady() {
      // Demo mode auto-connects (1s delay + 500ms simulateConnect)
      // then creates profile + baseline snapshot.
      // Wait for the "Start Tuning Session" button as it's the most reliable
      // indicator that the full dashboard is loaded (profile, FC info, blackbox status all ready).
      await page
        .getByRole('button', { name: /start tuning/i })
        .waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    },

    async waitForPhase(phaseText: string, timeout = ANALYSIS_TIMEOUT) {
      await page.getByText(phaseText).first().waitFor({
        state: 'visible',
        timeout,
      });
    },

    async close() {
      await app.close();
    },
  };

  return demoApp;
}
