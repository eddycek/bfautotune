/**
 * Demo mode smoke test.
 *
 * Verifies the app launches in demo mode, auto-connects,
 * and shows the main dashboard with expected elements.
 */
import { test, expect } from '@playwright/test';
import { launchDemoApp, type DemoApp } from './electron-app';

let demo: DemoApp;

test.beforeAll(async () => {
  demo = await launchDemoApp();
});

test.afterAll(async () => {
  await demo?.close();
});

test('app launches and auto-connects in demo mode', async () => {
  await demo.waitForDemoReady();
  await demo.screenshot('01-demo-connected');

  // Verify connection indicator (specific to connection status span)
  await expect(demo.page.getByText('Connected /dev/demo')).toBeVisible();

  // Verify FC info is displayed
  await expect(demo.page.getByText('BTFL 4.5.1')).toBeVisible();

  // Verify demo profile was created
  await expect(demo.page.getByText('Demo Quad')).toBeVisible();
});

test('dashboard shows blackbox status', async () => {
  // Blackbox section should be visible
  await expect(demo.page.getByText('Blackbox')).toBeVisible();

  // Flash should show data (demo starts with flash populated)
  await expect(demo.page.getByText(/flash/i)).toBeVisible();
});

test('start tuning button is available', async () => {
  const startBtn = demo.page.getByRole('button', { name: /start tuning/i });
  await expect(startBtn).toBeVisible();
});

test('reset demo button is visible', async () => {
  const resetBtn = demo.page.getByRole('button', { name: /reset demo/i });
  await expect(resetBtn).toBeVisible();
});
