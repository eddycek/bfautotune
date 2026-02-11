# Testing Guidelines

> **Rule:** After adding or removing tests, update the test inventory in this file. Keep counts accurate.

## Overview

This project uses **Vitest** and **React Testing Library** for testing. All UI changes must include tests and pass before committing.

## Test Stack

- **Vitest** - Fast unit test framework (Vite-native)
- **React Testing Library** - React component testing utilities
- **@testing-library/jest-dom** - Custom matchers for DOM assertions
- **@testing-library/user-event** - User interaction simulation
- **jsdom** - DOM implementation for Node.js

## Running Tests

```bash
# Watch mode (development)
npm test

# Single run (CI / pre-commit)
npm run test:run

# Interactive UI
npm run test:ui

# Coverage report
npm run test:coverage
```

## Pre-commit Hook

Tests run automatically before each commit via **husky** and **lint-staged**:
- Only tests related to changed files are executed
- Commit is blocked if tests fail

## Writing Tests

### File Location & Naming

Place test files next to the source file:
```
src/renderer/components/
  ConnectionPanel/
    ConnectionPanel.tsx          ← Component
    ConnectionPanel.test.tsx     ← Tests
    ConnectionPanel.css
```

- `.test.tsx` for component tests
- `.test.ts` for utility/hook/backend tests

### Basic Structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YourComponent } from './YourComponent';

describe('YourComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(window.betaflight.someMethod).mockResolvedValue(mockData);
  });

  it('renders correctly', () => {
    render(<YourComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    render(<YourComponent />);

    await user.click(screen.getByRole('button', { name: /click me/i }));

    await waitFor(() => {
      expect(screen.getByText('Result')).toBeInTheDocument();
    });
  });
});
```

### Common Patterns

**Querying elements:**
```typescript
screen.getByRole('button', { name: /connect/i })  // preferred
screen.getByLabelText(/serial port/i)
screen.getByText(/connection/i)
```

**Async operations:**
```typescript
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});
```

**Mocking API calls:**
```typescript
beforeEach(() => {
  vi.mocked(window.betaflight.connect).mockResolvedValue(undefined);
  vi.mocked(window.betaflight.listPorts).mockResolvedValue(mockPorts);
});
```

**Error states:**
```typescript
vi.mocked(window.betaflight.connect).mockRejectedValue(new Error('Connection failed'));
```

## Best Practices

**DO:**
- Test user behavior, not implementation details
- Use accessible queries (`getByRole`, `getByLabelText`)
- Use `waitFor()` for async state updates
- Clean up mocks with `vi.clearAllMocks()` in `beforeEach`
- Test edge cases: empty states, errors, loading, disabled

**DON'T:**
- Test implementation details (internal state, private methods)
- Use `setTimeout()` / `wait()` — use `waitFor()` instead
- Test library code — test YOUR code
- Skip cleanup — always reset mocks in `beforeEach`

## Debugging

```typescript
screen.debug();           // Print current DOM
it.only('...', () => {}); // Run only this test
it.skip('...', () => {}); // Skip this test
```

```bash
npm run test:ui           # Visual interface with DOM snapshots
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "not wrapped in act(...)" | Use `waitFor()` for async state updates |
| Test fails only in CI | Check for race conditions, use `waitFor` |
| Flaky test | Add `waitFor()`, increase timeout if needed |
| Mock not working | Ensure `vi.clearAllMocks()` in `beforeEach`, mock before `render()` |

---

## Test Inventory

**Total: 1520 tests across 82 files** (last verified: February 12, 2026)

### UI Components

| File | Tests | Description |
|------|-------|-------------|
| `ConnectionPanel/ConnectionPanel.test.tsx` | 13 | Connection flow, port scanning, cooldown, auto-cooldown on unexpected disconnect |
| `FCInfo/FCInfoDisplay.test.tsx` | 33 | FC information display, CLI export, diagnostics, version-aware debug mode, feedforward config, fix/reset settings |
| `FCInfo/FixSettingsConfirmModal.test.tsx` | 4 | Fix settings confirmation modal, reboot warning, confirm/cancel |
| `BlackboxStatus/BlackboxStatus.test.tsx` | 15 | Blackbox status, download trigger, readonly mode, onAnalyze with filename |
| `ProfileSelector.test.tsx` | 11 | Profile switching, locking when FC connected |
| `ProfileEditModal.test.tsx` | 18 | Profile editing, validation, form handling, flight style selector |
| `ProfileDeleteModal.test.tsx` | 12 | Deletion confirmation, warnings |
| `SnapshotManager/SnapshotManager.test.tsx` | 36 | Snapshot CRUD, export, restore, baseline handling, dynamic numbering |
| `SnapshotManager/SnapshotDiffModal.test.tsx` | 13 | Snapshot diff view, change display |
| `SnapshotManager/snapshotDiffUtils.test.ts` | 24 | CLI diff parsing, change computation |
| `Toast/Toast.test.tsx` | 14 | Toast notification rendering and lifecycle |
| `Toast/ToastContainer.test.tsx` | 6 | Toast container layout and stacking |
| `TuningStatusBanner/TuningStatusBanner.test.tsx` | 28 | Workflow banner, step indicator, actions, downloading, applied phases, BB settings pre-flight warning, verification flow |
| `TuningWizard/TuningWizard.test.tsx` | 46 | Multi-step wizard flow, results display, apply, mode-aware routing, onApplyComplete with metrics, FF warning, RPM status, flight style display |
| `TuningWizard/FlightGuideContent.test.tsx` | 9 | Flight guide content rendering, version-aware tip filtering |
| `TuningWizard/TestFlightGuideStep.test.tsx` | 5 | Flight guide step integration |
| `TuningWorkflowModal/TuningWorkflowModal.test.tsx` | 9 | Workflow preparation modal |
| `AnalysisOverview/AnalysisOverview.test.tsx` | 25 | Diagnostic-only analysis view, auto-parse, session picker, breadcrumb navigation, session metadata, FF warning, RPM status |
| `TuningWizard/PIDAnalysisStep.test.tsx` | 5 | PID results display, flight style pill, step count pluralization |
| `TuningWizard/RecommendationCard.test.tsx` | 9 | Setting label lookup, value display, change percentage, confidence |
| `TuningWizard/ApplyConfirmationModal.test.tsx` | 9 | Change counts, snapshot checkbox, confirm/cancel, reboot warning |
| `TuningWizard/WizardProgress.test.tsx` | 8 | Step indicator, mode-aware filtering, current/done/upcoming states |
| `TuningWizard/SessionSelectStep.test.tsx` | 8 | Session picker, auto-parse, parsing/error/empty states, reverse order |
| `TuningWizard/TuningSummaryStep.test.tsx` | 14 | Recommendations table, mode-aware labels, apply/progress/success/error states |
| `TuningWizard/charts/AxisTabs.test.tsx` | 6 | Tab rendering, selection, aria-selected, onChange callback |
| `TuningHistory/AppliedChangesTable.test.tsx` | 7 | Setting changes table, percent formatting, empty state, zero value handling |
| `TuningHistory/NoiseComparisonChart.test.tsx` | 7 | Before/after spectrum overlay, delta pill, axis tabs, empty state |
| `TuningHistory/TuningCompletionSummary.test.tsx` | 10 | Completion summary with/without verification, noise chart, changes, PID metrics, actions |
| `TuningHistory/TuningHistoryPanel.test.tsx` | 8 | History list, expand/collapse, detail view, empty/loading states |
| `ProfileWizard.test.tsx` | 6 | Profile creation wizard, flight style selector, preset mapping |

### Charts

| File | Tests | Description |
|------|-------|-------------|
| `TuningWizard/charts/chartUtils.test.ts` | 20 | Data conversion, downsampling, findBestStep, robust Y domain |
| `TuningWizard/charts/SpectrumChart.test.tsx` | 5 | FFT spectrum chart rendering |
| `TuningWizard/charts/StepResponseChart.test.tsx` | 10 | Step response chart rendering, navigation |

### Contexts

| File | Tests | Description |
|------|-------|-------------|
| `contexts/ToastContext.test.tsx` | 10 | Toast context provider, add/remove/auto-dismiss |

### Hooks

| File | Tests | Description |
|------|-------|-------------|
| `hooks/useConnection.test.ts` | 14 | Connection state, port management, error handling |
| `hooks/useProfiles.test.ts` | 15 | Profile CRUD, event subscriptions |
| `hooks/useSnapshots.test.ts` | 19 | Snapshot management, restore, event-driven updates |
| `hooks/useTuningWizard.test.ts` | 22 | Wizard state, parse/analyze/apply lifecycle |
| `hooks/useTuningSession.test.ts` | 8 | Tuning session lifecycle, IPC events |
| `hooks/useTuningHistory.test.ts` | 5 | History loading, profile/session change reload, error handling |
| `hooks/useAnalysisOverview.test.ts` | 12 | Auto-parse, dual analysis, session picker |
| `hooks/useFCInfo.test.ts` | 8 | FC info fetch, CLI export, loading/error states |
| `hooks/useToast.test.tsx` | 5 | Toast helper methods, context requirement |
| `hooks/useBlackboxInfo.test.ts` | 8 | Auto-load, refresh, concurrent request prevention |
| `hooks/useBlackboxLogs.test.ts` | 9 | Log list, profile change subscription, delete, openFolder |
| `utils/bbSettingsUtils.test.ts` | 18 | BB settings status computation, version-aware debug mode, fix/reset commands |

### IPC Handlers

| File | Tests | Description |
|------|-------|-------------|
| `ipc/handlers.test.ts` | 103 | All 43 IPC handler channels: connection, FC info, profiles, snapshots, blackbox, PID config, analysis, tuning apply, snapshot restore, tuning session, BB settings fix, handler registration |

### MSP Protocol & Client

| File | Tests | Description |
|------|-------|-------------|
| `msp/MSPProtocol.test.ts` | 30 | MSPv1 encode/decode, jumbo frames, round-trip, parseBuffer, checksum validation, garbage recovery |
| `msp/MSPConnection.test.ts` | 39 | Connection lifecycle, sendCommand, timeouts, error/partial responses, CLI mode, event forwarding |
| `msp/MSPClient.test.ts` | 54 | FC info queries, PID/filter/FF config, board info parsing, UID, blackbox info, set PID, CLI diff, save & reboot, connect/disconnect lifecycle, version gate, listPorts |

### Storage

| File | Tests | Description |
|------|-------|-------------|
| `storage/FileStorage.test.ts` | 14 | Snapshot JSON save/load/delete/list/export, ensureDirectory, snapshotExists |
| `storage/ProfileStorage.test.ts` | 15 | Profile persistence, loadProfiles, findBySerial, export, ensureDirectory idempotent |
| `storage/ProfileManager.test.ts` | 23 | Profile CRUD, preset creation, current profile, link/unlink snapshots, export |
| `storage/SnapshotManager.test.ts` | 16 | Snapshot creation via MSP, baseline management, server-side filtering, delete protection |
| `storage/BlackboxManager.test.ts` | 18 | Log save/list/get/delete/export, profile filtering, soft delete, initialization |
| `storage/TuningSessionManager.test.ts` | 15 | Session CRUD, phase transitions, per-profile persistence |
| `storage/TuningHistoryManager.test.ts` | 14 | History archive, retrieval ordering, corrupted data handling, per-profile isolation, delete |

### Blackbox Parser

| File | Tests | Description |
|------|-------|-------------|
| `blackbox/BlackboxParser.test.ts` | 35 | End-to-end parsing, multi-session, corruption recovery |
| `blackbox/BlackboxParser.fuzz.test.ts` | 18 | Fuzz/property-based: random bytes, truncation, extreme values, oversized frames, all-zero, huge iterations |
| `blackbox/BlackboxParser.integration.test.ts` | 9 | Real flight BBL regression tests |
| `blackbox/realflight.regression.test.ts` | 13 | Additional real-flight regression tests |
| `blackbox/StreamReader.test.ts` | 35 | Binary stream reading, variable-byte encoding |
| `blackbox/HeaderParser.test.ts` | 25 | BBL header parsing, field definitions |
| `blackbox/ValueDecoder.test.ts` | 64 | 10 encoding types |
| `blackbox/PredictorApplier.test.ts` | 31 | 10 predictor types, C integer division |
| `blackbox/FrameParser.test.ts` | 15 | I/P/S frame decoding |

### FFT Analysis

| File | Tests | Description |
|------|-------|-------------|
| `analysis/FFTCompute.test.ts` | 20 | Hanning window, Welch's method, sine detection |
| `analysis/SegmentSelector.test.ts` | 27 | Hover detection, throttle normalization |
| `analysis/NoiseAnalyzer.test.ts` | 25 | Peak detection, classification, noise floor |
| `analysis/FilterRecommender.test.ts` | 41 | Noise-based targets, convergence, safety bounds, RPM-aware bounds, dynamic notch, motor diagnostic |
| `analysis/FilterAnalyzer.test.ts` | 14 | End-to-end pipeline, progress reporting, segment fallback warnings, RPM context propagation |

### Step Response Analysis

| File | Tests | Description |
|------|-------|-------------|
| `analysis/StepDetector.test.ts` | 16 | Derivative-based step detection, hold/cooldown |
| `analysis/StepMetrics.test.ts` | 22 | Rise time, overshoot, settling, latency, ringing, FF contribution classification |
| `analysis/PIDRecommender.test.ts` | 40 | Flight PID anchoring, convergence, safety bounds, FF context, FF-aware recommendations, flight style thresholds |
| `analysis/PIDAnalyzer.test.ts` | 17 | End-to-end pipeline, progress reporting, FF context wiring, flight style propagation |
| `analysis/AnalysisPipeline.realdata.test.ts` | 20 | End-to-end filter+PID analysis with bf45-reference fixture and real_flight.bbl, safety bounds, determinism, performance |

### E2E Workflow Tests

| File | Tests | Description |
|------|-------|-------------|
| `e2e/tuningWorkflow.e2e.test.ts` | 30 | Profile+connection workflow, snapshot CRUD+restore, tuning session lifecycle, apply recommendations 4-stage ordering, error recovery, BB settings fix, full tuning cycle |

### Header Validation

| File | Tests | Description |
|------|-------|-------------|
| `analysis/constants.test.ts` | 7 | PID style threshold validation, ordering constraints, balanced-matches-existing |

### Shared Constants & Types

| File | Tests | Description |
|------|-------|-------------|
| `shared/utils/metricsExtract.test.ts` | 12 | Spectrum downsampling, filter/PID metrics extraction, boundary handling |
| `shared/constants.test.ts` | 7 | Preset profile flight style mapping validation |
| `shared/types/profile.types.test.ts` | 5 | FlightStyle type compilation, DroneProfileOptional inheritance |

### Header Validation

| File | Tests | Description |
|------|-------|-------------|
| `analysis/headerValidation.test.ts` | 20 | GYRO_SCALED check, logging rate validation, BF version-aware debug mode, BBL header RPM enrichment |
