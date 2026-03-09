/**
 * Generates stress-test tuning sessions with edge-case scenarios.
 *
 * Unlike the progressive showcase (demo:generate-history), this generates
 * sessions designed to exercise UI warnings, poor data quality indicators,
 * mechanical health alerts, and regression scenarios.
 *
 *   npm run demo:generate-history:stress
 */
import { test, expect } from '@playwright/test';
import { launchDemoApp, type DemoApp } from './electron-app';

// Generous timeout — multiple cycles
test.setTimeout(300_000);

let demo: DemoApp;

test.beforeAll(async () => {
  demo = await launchDemoApp({ persistToDevData: true });
  await demo.waitForDemoReady();
});

test.afterAll(async () => {
  if (demo) {
    await demo.screenshot('stress-sessions-final');
    await demo.close();
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runDeepCycle(cycleNum: number): Promise<void> {
  const page = demo.page;
  const WAIT = 30_000;
  const ANALYSIS_WAIT = 60_000;

  console.log(`\n=== Stress: Deep Tune cycle ${cycleNum} ===`);

  await demo.clickButton('Start Tuning Session');
  const modal = page.locator('.start-tuning-overlay');
  await modal.getByRole('button', { name: 'Deep Tune' }).click();
  await demo.waitForText('Erase Blackbox data', WAIT);

  // Filter phase
  await demo.clickButton('Erase Flash');
  await demo.waitForText('Filter flight done', WAIT);
  await demo.clickButton('Download Log');
  await demo.waitForText('Open Filter Wizard', WAIT);
  await demo.clickButton('Open Filter Wizard');
  await demo.clickButton('Run Filter Analysis');
  await page
    .getByRole('button', { name: /Continue to Summary/i })
    .waitFor({ state: 'visible', timeout: ANALYSIS_WAIT });
  await demo.clickButton(/Continue to Summary/i);

  const applyFiltersBtn = page.getByRole('button', { name: 'Apply Filters' });
  const noFilterChangesBtn = page.getByRole('button', { name: 'Continue (No Changes)' });
  await applyFiltersBtn.or(noFilterChangesBtn).waitFor({ state: 'visible', timeout: WAIT });

  if (await noFilterChangesBtn.isVisible().catch(() => false)) {
    await noFilterChangesBtn.click();
  } else {
    await applyFiltersBtn.click();
    const filterApplyBtns = page.getByRole('button', { name: 'Apply Changes' });
    await filterApplyBtns.last().waitFor({ state: 'visible', timeout: 5_000 });
    await filterApplyBtns.last().click();
  }
  await page
    .getByRole('button', { name: 'Close Wizard' })
    .waitFor({ state: 'visible', timeout: WAIT });
  await demo.clickButton('Close Wizard');

  // PID phase
  const continueBtn = page.getByRole('button', { name: 'Continue' });
  const eraseBtn = page.getByRole('button', { name: 'Erase Flash' });
  await expect(continueBtn.or(eraseBtn)).toBeVisible({ timeout: WAIT });
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click();
  } else {
    await eraseBtn.click();
  }

  await demo.waitForText('PID flight done', WAIT);
  await demo.clickButton('Download Log');
  await demo.waitForText('Open PID Wizard', WAIT);
  await demo.clickButton('Open PID Wizard');
  await demo.clickButton('Run PID Analysis');
  await page
    .getByRole('button', { name: /Continue to Summary/i })
    .waitFor({ state: 'visible', timeout: ANALYSIS_WAIT });
  await demo.clickButton(/Continue to Summary/i);

  const applyPIDsBtn = page.getByRole('button', { name: 'Apply PIDs' });
  const noPIDChangesBtn = page.getByRole('button', { name: 'Continue (No Changes)' });
  await applyPIDsBtn.or(noPIDChangesBtn).waitFor({ state: 'visible', timeout: WAIT });

  if (await noPIDChangesBtn.isVisible().catch(() => false)) {
    await noPIDChangesBtn.click();
  } else {
    await applyPIDsBtn.click();
    const pidApplyBtns = page.getByRole('button', { name: 'Apply Changes' });
    await pidApplyBtns.last().waitFor({ state: 'visible', timeout: 5_000 });
    await pidApplyBtns.last().click();
  }
  await page
    .getByRole('button', { name: 'Close Wizard' })
    .waitFor({ state: 'visible', timeout: WAIT });
  await demo.clickButton('Close Wizard');

  // Skip verification
  await page
    .getByRole('button', { name: 'Skip & Complete' })
    .waitFor({ state: 'visible', timeout: WAIT });
  await demo.clickButton('Skip & Complete');
  await demo.waitForText(/Deep Tune Complete/i, 15_000);

  await demo.screenshot(`stress-cycle-${cycleNum}-deep-complete`);

  const dismissBtn = page.getByRole('button', { name: 'Dismiss', exact: true });
  await dismissBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await dismissBtn.click();

  await page
    .getByRole('button', { name: /start tuning/i })
    .waitFor({ state: 'visible', timeout: WAIT });

  console.log(`  Cycle ${cycleNum}: Deep Tune complete and dismissed`);
}

async function runFlashCycle(cycleNum: number): Promise<void> {
  const page = demo.page;
  const WAIT = 30_000;
  const ANALYSIS_WAIT = 60_000;

  console.log(`\n=== Stress: Flash Tune cycle ${cycleNum} ===`);

  await demo.clickButton('Start Tuning Session');
  const modal = page.locator('.start-tuning-overlay');
  await modal.getByRole('button', { name: 'Flash Tune' }).click();
  await demo.waitForText('Erase Blackbox data', WAIT);

  await demo.clickButton('Erase Flash');
  await demo.waitForText('Flight done', WAIT);
  await demo.clickButton('Download Log');
  await demo.waitForText('Open Flash Tune Wizard', WAIT);
  await demo.clickButton('Open Flash Tune Wizard');

  await page
    .getByRole('button', { name: /Continue to Summary/i })
    .waitFor({ state: 'visible', timeout: ANALYSIS_WAIT });
  await demo.clickButton(/Continue to Summary/i);

  const applyAllBtn = page.getByRole('button', { name: 'Apply All Changes' });
  const noQuickChangesBtn = page.getByRole('button', { name: 'Continue (No Changes)' });
  await applyAllBtn.or(noQuickChangesBtn).waitFor({ state: 'visible', timeout: WAIT });

  if (await noQuickChangesBtn.isVisible().catch(() => false)) {
    await noQuickChangesBtn.click();
  } else {
    await applyAllBtn.click();
    const applyBtns = page.getByRole('button', { name: 'Apply Changes' });
    await applyBtns.last().waitFor({ state: 'visible', timeout: 5_000 });
    await applyBtns.last().click();
  }
  await page
    .getByRole('button', { name: 'Close Wizard' })
    .waitFor({ state: 'visible', timeout: WAIT });
  await demo.clickButton('Close Wizard');

  await page
    .getByRole('button', { name: 'Skip & Complete' })
    .waitFor({ state: 'visible', timeout: WAIT });
  await demo.clickButton('Skip & Complete');
  await demo.waitForText(/Flash Tune Complete/i, 15_000);

  await demo.screenshot(`stress-cycle-${cycleNum}-flash-complete`);

  const dismissBtn = page.getByRole('button', { name: 'Dismiss', exact: true });
  await dismissBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await dismissBtn.click();

  await page
    .getByRole('button', { name: /start tuning/i })
    .waitFor({ state: 'visible', timeout: WAIT });

  console.log(`  Cycle ${cycleNum}: Flash Tune complete and dismissed`);
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test('generate 5 stress sessions', async () => {
  // Mix of deep and flash sessions — the stateful MockMSPClient
  // means each session sees progressively different current values
  // and the cycle-based noise reduction produces varying quality scores.
  // Some sessions will naturally produce warnings (poor data quality,
  // mechanical health issues, wind disturbance) based on the cycle's
  // noise characteristics.

  // Session 1: Deep Tune (cycle 0 — very noisy baseline, low quality)
  await runDeepCycle(1);

  // Session 2: Flash Tune (cycle 1 — first improvement)
  await runFlashCycle(2);

  // Session 3: Deep Tune (cycle 2 — significant improvement)
  await runDeepCycle(3);

  // Session 4: Flash Tune (cycle 3 — near-optimal)
  await runFlashCycle(4);

  // Session 5: Deep Tune (cycle 4 — fully optimized)
  await runDeepCycle(5);

  // Verify history is visible
  await demo.waitForText('Tuning History', 10_000);
  const historySection = demo.page.getByText('Tuning History');
  await historySection.scrollIntoViewIfNeeded();
  await demo.screenshot('stress-sessions');
});
