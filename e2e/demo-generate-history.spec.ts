/**
 * Generates completed tuning sessions in demo mode.
 *
 * Session count is configurable via GENERATE_COUNT env var (default: 5).
 *
 * Three modes (run via npm scripts):
 *   npm run demo:generate-history                    — 5 mixed sessions (filter + pid + flash)
 *   npm run demo:generate-history:filter             — 5 filter tune sessions
 *   npm run demo:generate-history:pid                — 5 pid tune sessions
 *   npm run demo:generate-history:flash              — 5 flash tune sessions
 *   GENERATE_COUNT=15 npm run demo:generate-history  — 15 mixed sessions
 */
import { test, expect } from '@playwright/test';
import { launchDemoApp, type DemoApp } from './electron-app';

// Session count configurable via GENERATE_COUNT env var (default: 5)
const SESSION_COUNT = Math.max(1, parseInt(process.env.GENERATE_COUNT ?? '5', 10));

// Scale timeout: ~40s per session + 60s buffer
test.setTimeout(SESSION_COUNT * 40_000 + 60_000);

let demo: DemoApp;

test.beforeAll(async () => {
  // Persist to dev userData so data is available via `npm run dev:demo`
  demo = await launchDemoApp({ persistToDevData: true });
  await demo.waitForDemoReady();
});

test.afterAll(async () => {
  if (demo) {
    await demo.screenshot('history-sessions-final');
    await demo.close();
  }
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Click a random PID profile (1-4) in the StartTuningModal before selecting mode. */
async function selectRandomProfile(cycleNum: number): Promise<void> {
  const page = demo.page;
  const modal = page.locator('.start-tuning-overlay');
  const profileSelector = modal.locator('.start-tuning-profile-selector');

  // Profile selector only visible when FC has multiple profiles
  if (!(await profileSelector.isVisible().catch(() => false))) return;

  // Pick profile based on cycle number for reproducible variety (1-indexed: profiles 1-4)
  const profileIndex = cycleNum % 4; // 0-based: 0, 1, 2, 3
  const profileBtn = profileSelector.locator('.start-tuning-profile-btn').nth(profileIndex);
  await profileBtn.click();
  console.log(`  Cycle ${cycleNum}: selected BF PID profile ${profileIndex + 1}`);
}

async function runFilterCycle(cycleNum: number): Promise<void> {
  const page = demo.page;
  const WAIT = 30_000;
  const ANALYSIS_WAIT = 60_000;

  console.log(`\n=== Starting Filter Tune cycle ${cycleNum} ===`);

  // 1. Start Tuning Session (modal → Filter Tune)
  await demo.clickButton('Start Tuning Session');
  // Use modal-scoped locator to avoid strict mode violation when history has "Flash Tune" text
  const modal = page.locator('.start-tuning-overlay');
  await selectRandomProfile(cycleNum);
  await modal.getByRole('button', { name: 'Filter Tune' }).click();
  await demo.waitForText('Erase Blackbox data', WAIT);

  // 2. Filter flight: erase → auto-flight → download → analysis → apply
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

  // Apply filters or continue without changes
  const applyFiltersBtn = page.getByRole('button', { name: 'Apply Filters' });
  const noFilterChangesBtn = page.getByRole('button', { name: 'Continue (No Changes)' });
  await applyFiltersBtn.or(noFilterChangesBtn).waitFor({ state: 'visible', timeout: WAIT });

  if (await noFilterChangesBtn.isVisible().catch(() => false)) {
    console.log(`  Cycle ${cycleNum}: no filter changes, continuing without apply`);
    await noFilterChangesBtn.click();
  } else {
    console.log(`  Cycle ${cycleNum}: applying filter changes`);
    await applyFiltersBtn.click();
    const filterApplyBtns = page.getByRole('button', { name: 'Apply Changes' });
    await filterApplyBtns.last().waitFor({ state: 'visible', timeout: 5_000 });
    await filterApplyBtns.last().click();
  }
  await page
    .getByRole('button', { name: 'Close Wizard' })
    .waitFor({ state: 'visible', timeout: WAIT });
  await demo.clickButton('Close Wizard');

  // 3. Verification flight (if changes applied) or direct completion (if no changes)
  const eraseVerifyBtn = page.getByRole('button', { name: 'Erase & Verify' });
  const completeText = page.getByText(/Filter Tune Complete/i);
  await eraseVerifyBtn.or(completeText).waitFor({ state: 'visible', timeout: WAIT });

  if (await eraseVerifyBtn.isVisible().catch(() => false)) {
    console.log(`  Cycle ${cycleNum}: running verification flight`);
    await eraseVerifyBtn.click();
    await demo.waitForText('Download Log', WAIT);
    await demo.clickButton('Download Log');
    await demo.waitForText('Analyze Verification', WAIT);
    await demo.clickButton('Analyze Verification');
    await demo.waitForText(/Filter Tune Complete/i, ANALYSIS_WAIT);
  } else {
    console.log(`  Cycle ${cycleNum}: no changes → verification skipped`);
  }

  await demo.screenshot(`history-cycle-${cycleNum}-filter-complete`);

  const dismissBtn = page.getByRole('button', { name: 'Dismiss', exact: true });
  await dismissBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await dismissBtn.click();

  await page
    .getByRole('button', { name: /start tuning/i })
    .waitFor({ state: 'visible', timeout: WAIT });

  console.log(`  Cycle ${cycleNum}: Filter Tune complete and dismissed`);
}

async function runPIDCycle(cycleNum: number): Promise<void> {
  const page = demo.page;
  const WAIT = 30_000;
  const ANALYSIS_WAIT = 60_000;

  console.log(`\n=== Starting PID Tune cycle ${cycleNum} ===`);

  // 1. Start Tuning Session (modal → PID Tune)
  await demo.clickButton('Start Tuning Session');
  const modal = page.locator('.start-tuning-overlay');
  await selectRandomProfile(cycleNum);
  await modal.getByRole('button', { name: 'PID Tune' }).click();
  await demo.waitForText('Erase Blackbox data', WAIT);

  // 2. PID flight: erase → auto-flight → download → analysis → apply
  await demo.clickButton('Erase Flash');
  await demo.waitForText('PID flight done', WAIT);
  await demo.clickButton('Download Log');
  await demo.waitForText('Open PID Wizard', WAIT);
  await demo.clickButton('Open PID Wizard');
  await demo.clickButton('Run PID Analysis');
  await page
    .getByRole('button', { name: /Continue to Summary/i })
    .waitFor({ state: 'visible', timeout: ANALYSIS_WAIT });
  await demo.clickButton(/Continue to Summary/i);

  // Apply PIDs or continue without changes
  const applyPIDsBtn = page.getByRole('button', { name: 'Apply PIDs' });
  const noPIDChangesBtn = page.getByRole('button', { name: 'Continue (No Changes)' });
  await applyPIDsBtn.or(noPIDChangesBtn).waitFor({ state: 'visible', timeout: WAIT });

  if (await noPIDChangesBtn.isVisible().catch(() => false)) {
    console.log(`  Cycle ${cycleNum}: no PID changes, continuing without apply`);
    await noPIDChangesBtn.click();
  } else {
    console.log(`  Cycle ${cycleNum}: applying PID changes`);
    await applyPIDsBtn.click();
    const pidApplyBtns = page.getByRole('button', { name: 'Apply Changes' });
    await pidApplyBtns.last().waitFor({ state: 'visible', timeout: 5_000 });
    await pidApplyBtns.last().click();
  }
  await page
    .getByRole('button', { name: 'Close Wizard' })
    .waitFor({ state: 'visible', timeout: WAIT });
  await demo.clickButton('Close Wizard');

  // 3. Verification flight (if changes applied) or direct completion (if no changes)
  const eraseVerifyBtn = page.getByRole('button', { name: 'Erase & Verify' });
  const completeText = page.getByText(/PID Tune Complete/i);
  await eraseVerifyBtn.or(completeText).waitFor({ state: 'visible', timeout: WAIT });

  if (await eraseVerifyBtn.isVisible().catch(() => false)) {
    console.log(`  Cycle ${cycleNum}: running verification flight`);
    await eraseVerifyBtn.click();
    await demo.waitForText('Download Log', WAIT);
    await demo.clickButton('Download Log');
    await demo.waitForText('Analyze Verification', WAIT);
    await demo.clickButton('Analyze Verification');
    await demo.waitForText(/PID Tune Complete/i, ANALYSIS_WAIT);
  } else {
    console.log(`  Cycle ${cycleNum}: no changes → verification skipped`);
  }

  await demo.screenshot(`history-cycle-${cycleNum}-pid-complete`);

  const dismissBtn = page.getByRole('button', { name: 'Dismiss', exact: true });
  await dismissBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await dismissBtn.click();

  await page
    .getByRole('button', { name: /start tuning/i })
    .waitFor({ state: 'visible', timeout: WAIT });

  console.log(`  Cycle ${cycleNum}: PID Tune complete and dismissed`);
}

async function runQuickCycle(cycleNum: number): Promise<void> {
  const page = demo.page;
  const WAIT = 30_000;
  const ANALYSIS_WAIT = 60_000;

  console.log(`\n=== Starting Flash Tune cycle ${cycleNum} ===`);

  // 1. Start Flash Tune Session (modal → Flash Tune)
  await demo.clickButton('Start Tuning Session');
  // Use modal-scoped locator to avoid strict mode violation
  // (Tuning History may also contain "Flash Tune" text)
  const modal = page.locator('.start-tuning-overlay');
  await selectRandomProfile(cycleNum);
  await modal.getByRole('button', { name: 'Flash Tune' }).click();
  await demo.waitForText('Erase Blackbox data', WAIT);

  // 2. Flash Tune flight: erase → auto-flight → download → flash wizard → apply
  await demo.clickButton('Erase Flash');
  await demo.waitForText('Flight done', WAIT);
  await demo.clickButton('Download Log');
  await demo.waitForText('Open Flash Tune Wizard', WAIT);
  await demo.clickButton('Open Flash Tune Wizard');

  // Quick wizard auto-runs both analyses — wait for Continue to Summary
  await page
    .getByRole('button', { name: /Continue to Summary/i })
    .waitFor({ state: 'visible', timeout: ANALYSIS_WAIT });
  await demo.clickButton(/Continue to Summary/i);

  // Apply All Changes or continue without changes
  const applyAllBtn = page.getByRole('button', { name: 'Apply All Changes' });
  const noQuickChangesBtn = page.getByRole('button', { name: 'Continue (No Changes)' });
  await applyAllBtn.or(noQuickChangesBtn).waitFor({ state: 'visible', timeout: WAIT });

  if (await noQuickChangesBtn.isVisible().catch(() => false)) {
    console.log(`  Cycle ${cycleNum}: no flash changes, continuing without apply`);
    await noQuickChangesBtn.click();
  } else {
    console.log(`  Cycle ${cycleNum}: applying all flash changes`);
    await applyAllBtn.click();
    const applyBtns = page.getByRole('button', { name: 'Apply Changes' });
    await applyBtns.last().waitFor({ state: 'visible', timeout: 5_000 });
    await applyBtns.last().click();
  }
  await page
    .getByRole('button', { name: 'Close Wizard' })
    .waitFor({ state: 'visible', timeout: WAIT });
  await demo.clickButton('Close Wizard');

  // 3. Verification flight (if changes applied) or direct completion (if no changes)
  const eraseVerifyBtn = page.getByRole('button', { name: 'Erase & Verify' });
  const completeText = page.getByText(/Flash Tune Complete/i);
  await eraseVerifyBtn.or(completeText).waitFor({ state: 'visible', timeout: WAIT });

  if (await eraseVerifyBtn.isVisible().catch(() => false)) {
    console.log(`  Cycle ${cycleNum}: running verification flight`);
    await eraseVerifyBtn.click();
    await demo.waitForText('Download Log', WAIT);
    await demo.clickButton('Download Log');
    await demo.waitForText('Analyze Verification', WAIT);
    await demo.clickButton('Analyze Verification');
    await demo.waitForText(/Flash Tune Complete/i, ANALYSIS_WAIT);
  } else {
    console.log(`  Cycle ${cycleNum}: no changes → verification skipped`);
  }

  await demo.screenshot(`history-cycle-${cycleNum}-quick-complete`);

  const dismissBtn = page.getByRole('button', { name: 'Dismiss', exact: true });
  await dismissBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await dismissBtn.click();

  await page
    .getByRole('button', { name: /start tuning/i })
    .waitFor({ state: 'visible', timeout: WAIT });

  console.log(`  Cycle ${cycleNum}: Flash Tune complete and dismissed`);
}

async function verifyHistory(): Promise<void> {
  await demo.waitForText('Tuning History', 10_000);
  const historySection = demo.page.getByText('Tuning History');
  await historySection.scrollIntoViewIfNeeded();
  const badges = demo.page.locator('.quality-badge, [class*="quality"]');
  await expect(badges.first()).toBeVisible({ timeout: 5_000 });
  await demo.screenshot('history-sessions');
}

// ---------------------------------------------------------------------------
// Tests — each selectable via --grep
// ---------------------------------------------------------------------------

test(`generate ${SESSION_COUNT} mixed sessions`, async () => {
  const runners = [runFilterCycle, runPIDCycle, runQuickCycle];
  for (let i = 1; i <= SESSION_COUNT; i++) {
    await runners[(i - 1) % runners.length](i);
  }
  await verifyHistory();
});

test(`generate ${SESSION_COUNT} filter sessions`, async () => {
  for (let i = 1; i <= SESSION_COUNT; i++) {
    await runFilterCycle(i);
  }
  await verifyHistory();
});

test(`generate ${SESSION_COUNT} pid sessions`, async () => {
  for (let i = 1; i <= SESSION_COUNT; i++) {
    await runPIDCycle(i);
  }
  await verifyHistory();
});

test(`generate ${SESSION_COUNT} flash sessions`, async () => {
  for (let i = 1; i <= SESSION_COUNT; i++) {
    await runQuickCycle(i);
  }
  await verifyHistory();
});
