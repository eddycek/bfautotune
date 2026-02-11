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

**Total: 963 tests across 52 files** (last verified: February 11, 2026)

### UI Components

| File | Tests | Description |
|------|-------|-------------|
| `ConnectionPanel/ConnectionPanel.test.tsx` | 12 | Connection flow, port scanning, cooldown |
| `FCInfo/FCInfoDisplay.test.tsx` | 24 | FC information display, CLI export, diagnostics, version-aware debug mode, feedforward config |
| `BlackboxStatus/BlackboxStatus.test.tsx` | 14 | Blackbox status, download trigger, readonly mode |
| `ProfileSelector.test.tsx` | 11 | Profile switching, locking when FC connected |
| `ProfileEditModal.test.tsx` | 18 | Profile editing, validation, form handling, flight style selector |
| `ProfileDeleteModal.test.tsx` | 12 | Deletion confirmation, warnings |
| `SnapshotManager/SnapshotManager.test.tsx` | 34 | Snapshot CRUD, export, restore, baseline handling |
| `SnapshotManager/SnapshotDiffModal.test.tsx` | 13 | Snapshot diff view, change display |
| `SnapshotManager/snapshotDiffUtils.test.ts` | 24 | CLI diff parsing, change computation |
| `Toast/Toast.test.tsx` | 14 | Toast notification rendering and lifecycle |
| `Toast/ToastContainer.test.tsx` | 6 | Toast container layout and stacking |
| `TuningStatusBanner/TuningStatusBanner.test.tsx` | 22 | Workflow banner, step indicator, actions, downloading, applied phases |
| `TuningWizard/TuningWizard.test.tsx` | 46 | Multi-step wizard flow, results display, apply, mode-aware routing, onApplyComplete, FF warning, RPM status, flight style display |
| `TuningWizard/FlightGuideContent.test.tsx` | 9 | Flight guide content rendering, version-aware tip filtering |
| `TuningWizard/TestFlightGuideStep.test.tsx` | 5 | Flight guide step integration |
| `TuningWorkflowModal/TuningWorkflowModal.test.tsx` | 9 | Workflow preparation modal |
| `AnalysisOverview/AnalysisOverview.test.tsx` | 22 | Diagnostic-only analysis view, auto-parse, session picker, FF warning, RPM status, flight style display |
| `TuningWizard/PIDAnalysisStep.test.tsx` | 5 | PID results display, flight style pill, step count pluralization |
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
| `hooks/useAnalysisOverview.test.ts` | 12 | Auto-parse, dual analysis, session picker |

### MSP Client

| File | Tests | Description |
|------|-------|-------------|
| `msp/MSPClient.test.ts` | 13 | Filter config parsing, flash payload extraction, feedforward config, RPM filter bytes |

### Storage

| File | Tests | Description |
|------|-------|-------------|
| `storage/TuningSessionManager.test.ts` | 15 | Session CRUD, phase transitions, per-profile persistence |

### Blackbox Parser

| File | Tests | Description |
|------|-------|-------------|
| `blackbox/BlackboxParser.test.ts` | 35 | End-to-end parsing, multi-session, corruption recovery |
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

### Header Validation

| File | Tests | Description |
|------|-------|-------------|
| `analysis/constants.test.ts` | 7 | PID style threshold validation, ordering constraints, balanced-matches-existing |

### Shared Constants & Types

| File | Tests | Description |
|------|-------|-------------|
| `shared/constants.test.ts` | 7 | Preset profile flight style mapping validation |
| `shared/types/profile.types.test.ts` | 5 | FlightStyle type compilation, DroneProfileOptional inheritance |

### Header Validation

| File | Tests | Description |
|------|-------|-------------|
| `analysis/headerValidation.test.ts` | 20 | GYRO_SCALED check, logging rate validation, BF version-aware debug mode, BBL header RPM enrichment |
