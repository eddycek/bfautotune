# Testing Guidelines

## Overview

This project uses **Vitest** and **React Testing Library** for UI testing. All UI changes must include tests and pass before committing.

## Test Stack

- **Vitest** - Fast unit test framework (Vite-native)
- **React Testing Library** - React component testing utilities
- **@testing-library/jest-dom** - Custom matchers for DOM assertions
- **@testing-library/user-event** - User interaction simulation
- **jsdom** - DOM implementation for Node.js

## Running Tests

### Watch Mode (Development)
```bash
npm test
```
Runs tests in watch mode. Tests automatically re-run when files change.

### Single Run (CI/Production)
```bash
npm run test:run
```
Runs all tests once and exits. Used in CI/CD pipelines.

### UI Mode (Interactive)
```bash
npm run test:ui
```
Opens Vitest UI in browser for interactive test debugging and visualization.

### Coverage Report
```bash
npm run test:coverage
```
Generates test coverage report in `coverage/` directory.

## Automated Testing

### Pre-commit Hook
Tests are automatically run before each commit via **husky** and **lint-staged**:
- Only tests related to changed files are executed
- Commit is blocked if tests fail
- Ensures all committed code is tested and working

### How It Works
1. You stage changes: `git add .`
2. You commit: `git commit -m "your message"`
3. Pre-commit hook runs automatically
4. Tests for changed files execute
5. If tests pass → commit succeeds
6. If tests fail → commit is blocked, fix tests first

## Writing Tests

### Test File Location
Place test files next to the component:
```
src/renderer/components/
  ConnectionPanel/
    ConnectionPanel.tsx          ← Component
    ConnectionPanel.test.tsx     ← Tests
    ConnectionPanel.css
```

### Test File Naming
- Use `.test.tsx` suffix for component tests
- Use `.test.ts` suffix for utility/hook tests

### Basic Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YourComponent } from './YourComponent';

describe('YourComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    vi.mocked(window.betaflight.someMethod).mockResolvedValue(mockData);
  });

  it('renders correctly', () => {
    render(<YourComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    render(<YourComponent />);

    const button = screen.getByRole('button', { name: /click me/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Result')).toBeInTheDocument();
    });
  });
});
```

### Common Testing Patterns

#### 1. Querying Elements
```typescript
// By text (case-insensitive)
screen.getByText(/connection/i)

// By role
screen.getByRole('button', { name: /connect/i })

// By label
screen.getByLabelText(/serial port/i)

// By test ID (use sparingly)
screen.getByTestId('connection-status')
```

#### 2. User Interactions
```typescript
const user = userEvent.setup();

// Click
await user.click(button);

// Type
await user.type(input, 'text to type');

// Select
await user.selectOptions(select, 'option-value');
```

#### 3. Async Operations
```typescript
// Wait for element to appear
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});

// Wait for element to disappear
await waitFor(() => {
  expect(screen.queryByText('Loading')).not.toBeInTheDocument();
});
```

#### 4. Mocking API Calls
```typescript
beforeEach(() => {
  vi.mocked(window.betaflight.connect).mockResolvedValue(undefined);
  vi.mocked(window.betaflight.listPorts).mockResolvedValue(mockPorts);
});

it('calls API correctly', async () => {
  render(<Component />);

  await waitFor(() => {
    expect(window.betaflight.connect).toHaveBeenCalledWith('/dev/ttyUSB0');
  });
});
```

#### 5. Testing Error States
```typescript
it('displays error when API fails', async () => {
  const errorMessage = 'Connection failed';
  vi.mocked(window.betaflight.connect).mockRejectedValue(new Error(errorMessage));

  render(<Component />);

  const button = screen.getByRole('button', { name: /connect/i });
  await userEvent.setup().click(button);

  await waitFor(() => {
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });
});
```

## Current Test Coverage

### Total: 522 tests across 31 test files

### UI Components (89+ tests)
- ✅ **ConnectionPanel** (12 tests) - Connection flow, port scanning, cooldown
- ✅ **ProfileSelector** (11 tests) - Profile switching, locking when FC connected
- ✅ **FCInfoDisplay** (12 tests) - FC information display, CLI export
- ✅ **ProfileEditModal** (18 tests) - Profile editing, validation, form handling
- ✅ **ProfileDeleteModal** (14 tests) - Deletion confirmation, warnings, active profile handling
- ✅ **SnapshotManager** (22 tests) - Snapshot creation, deletion, export, baseline handling
- ✅ **BlackboxStatus** - Blackbox status display and download trigger
- ✅ **Toast / ToastContainer** - Toast notification rendering and lifecycle
- ✅ **TuningWizard** - Multi-step tuning wizard flow and step navigation
- ✅ **TuningWorkflowModal** - Tuning preparation guide modal

### Hooks (45+ tests)
- ✅ **useConnection** (15 tests) - Connection state, port management, error handling
- ✅ **useProfiles** (14 tests) - Profile CRUD operations, event subscriptions
- ✅ **useSnapshots** (16 tests) - Snapshot management, event-driven updates
- ✅ **useTuningWizard** - Wizard state management, parse/analyze lifecycle

### Blackbox Parser (171 tests)
- ✅ **BlackboxParser** (16 tests) - End-to-end parsing, multi-session, corruption recovery
- ✅ **StreamReader** (35 tests) - Binary stream reading, variable-byte encoding
- ✅ **HeaderParser** (25 tests) - BBL header parsing, field definitions
- ✅ **ValueDecoder** (53 tests) - 10 encoding types
- ✅ **PredictorApplier** (27 tests) - 10 predictor types
- ✅ **FrameParser** (15 tests) - I/P/S frame decoding

### FFT Analysis (91 tests)
- ✅ **FFTCompute** (20 tests) - Hanning window, Welch's method, sine detection, spectral leakage
- ✅ **SegmentSelector** (18 tests) - Hover detection, throttle normalization, multi-format support
- ✅ **NoiseAnalyzer** (25 tests) - Peak detection, classification, noise floor estimation
- ✅ **FilterRecommender** (21 tests) - Rule engine, safety bounds, deduplication, friendly messages
- ✅ **FilterAnalyzer** (9 tests) - End-to-end pipeline, progress reporting, edge cases

### Step Response Analysis (58 tests)
- ✅ **StepDetector** (16 tests) - Derivative-based step detection, hold/cooldown validation
- ✅ **StepMetrics** (15 tests) - Rise time, overshoot, settling, latency, ringing
- ✅ **PIDRecommender** (18 tests) - Rule engine, safety bounds, P/D balance recommendations
- ✅ **PIDAnalyzer** (9 tests) - End-to-end pipeline, progress reporting

### Coverage Goals
- **Components**: ≥80% coverage ✅ **Achieved**
- **Utilities**: ≥90% coverage
- **Critical paths**: 100% coverage ✅ **Achieved**
  - ✅ Connection flow (ConnectionPanel + useConnection)
  - ✅ Profile management (ProfileSelector + useProfiles + modals)
  - ✅ Snapshot creation/restoration (SnapshotManager + useSnapshots)
  - ✅ Blackbox parsing pipeline (all 6 modules)
  - ✅ FFT analysis pipeline (all 5 modules)
  - ✅ Step response analysis pipeline (all 4 modules)
  - ✅ Tuning wizard flow (TuningWizard + useTuningWizard)

## Best Practices

### ✅ DO

1. **Test user behavior, not implementation**
   ```typescript
   // Good - tests what user sees
   expect(screen.getByText('Connected')).toBeInTheDocument();

   // Bad - tests implementation detail
   expect(component.state.isConnected).toBe(true);
   ```

2. **Use accessible queries**
   ```typescript
   // Good - follows accessibility best practices
   screen.getByRole('button', { name: /connect/i })
   screen.getByLabelText(/port/i)

   // Bad - brittle, implementation-dependent
   screen.getByClassName('connect-btn')
   ```

3. **Test async operations properly**
   ```typescript
   // Good
   await waitFor(() => {
     expect(screen.getByText('Success')).toBeInTheDocument();
   });

   // Bad - race condition
   expect(screen.getByText('Success')).toBeInTheDocument();
   ```

4. **Clean up mocks**
   ```typescript
   beforeEach(() => {
     vi.clearAllMocks();
   });
   ```

5. **Test edge cases**
   - Empty states (no profiles, no ports)
   - Error states (connection failures, API errors)
   - Loading states
   - Disabled states

### ❌ DON'T

1. **Don't test implementation details**
   - Avoid testing state directly
   - Avoid testing internal functions
   - Focus on user-visible behavior

2. **Don't use `wait()` or `setTimeout()`**
   ```typescript
   // Bad
   await wait(1000);

   // Good
   await waitFor(() => {
     expect(screen.getByText('Loaded')).toBeInTheDocument();
   });
   ```

3. **Don't skip cleanup**
   - Always use `beforeEach()` to reset mocks
   - Let React Testing Library handle DOM cleanup

4. **Don't test library code**
   - Don't test if React works
   - Don't test if third-party libraries work
   - Test YOUR code

## Debugging Tests

### 1. Use `screen.debug()`
```typescript
it('debug test', () => {
  render(<Component />);
  screen.debug(); // Prints current DOM to console
});
```

### 2. Use Vitest UI
```bash
npm run test:ui
```
Visual interface shows:
- Test results
- DOM snapshots
- Console logs
- Coverage

### 3. Isolate Failing Test
```typescript
// Run only this test
it.only('specific test', () => {
  // ...
});

// Skip this test
it.skip('flaky test', () => {
  // ...
});
```

## CI/CD Integration

Tests run automatically in CI/CD pipeline:
- On pull requests
- Before merging to main
- Before deployment

## Troubleshooting

### Test fails only in CI
- Check for timezone issues
- Check for race conditions (use `waitFor`)
- Ensure mocks are properly reset

### Test is flaky
- Add proper `waitFor()` calls
- Increase timeout if needed: `waitFor(() => {...}, { timeout: 5000 })`
- Check for async operations not being awaited

### Mock not working
- Ensure `vi.clearAllMocks()` in `beforeEach`
- Check mock is set up before `render()`
- Verify mock path is correct

## Test File Organization

### Component Tests
```
src/renderer/components/
  ConnectionPanel/
    ConnectionPanel.test.tsx         ← 12 tests
  FCInfo/
    FCInfoDisplay.test.tsx           ← 12 tests
  SnapshotManager/
    SnapshotManager.test.tsx         ← 22 tests
  BlackboxStatus/
    BlackboxStatus.test.tsx
  Toast/
    Toast.test.tsx
    ToastContainer.test.tsx
  TuningWizard/
    TuningWizard.test.tsx
  TuningWorkflowModal/
    TuningWorkflowModal.test.tsx
  ProfileSelector.test.tsx           ← 11 tests
  ProfileEditModal.test.tsx          ← 18 tests
  ProfileDeleteModal.test.tsx        ← 14 tests
```

### Hook Tests
```
src/renderer/hooks/
  useConnection.test.ts              ← 15 tests
  useProfiles.test.ts                ← 14 tests
  useSnapshots.test.ts               ← 16 tests
  useTuningWizard.test.ts
```

### Blackbox Parser Tests
```
src/main/blackbox/
  BlackboxParser.test.ts             ← 16 tests
  StreamReader.test.ts               ← 35 tests
  HeaderParser.test.ts               ← 25 tests
  ValueDecoder.test.ts               ← 53 tests
  PredictorApplier.test.ts           ← 27 tests
  FrameParser.test.ts                ← 15 tests
```

### FFT Analysis Tests
```
src/main/analysis/
  FFTCompute.test.ts                 ← 20 tests
  SegmentSelector.test.ts            ← 18 tests
  NoiseAnalyzer.test.ts              ← 25 tests
  FilterRecommender.test.ts          ← 21 tests
  FilterAnalyzer.test.ts             ← 9 tests
```

### Step Response Analysis Tests
```
src/main/analysis/
  StepDetector.test.ts               ← 16 tests
  StepMetrics.test.ts                ← 15 tests
  PIDRecommender.test.ts             ← 18 tests
  PIDAnalyzer.test.ts                ← 9 tests
```

## Examples

See existing test files for comprehensive examples:

### Component Testing
- `src/renderer/components/ConnectionPanel/ConnectionPanel.test.tsx` - Form interactions, async operations
- `src/renderer/components/ProfileSelector.test.tsx` - Conditional rendering, profile locking
- `src/renderer/components/FCInfo/FCInfoDisplay.test.tsx` - Data display, export functionality
- `src/renderer/components/SnapshotManager/SnapshotManager.test.tsx` - Complex interactions, dialogs
- `src/renderer/components/ProfileEditModal.test.tsx` - Form validation, loading states
- `src/renderer/components/ProfileDeleteModal.test.tsx` - Confirmation dialogs, warnings

### Hook Testing
- `src/renderer/hooks/useConnection.test.ts` - State management, event subscriptions
- `src/renderer/hooks/useProfiles.test.ts` - CRUD operations, error handling
- `src/renderer/hooks/useSnapshots.test.ts` - Event-driven updates, filtering

## Rule: All UI Changes Must Have Tests

**Mandatory Testing Policy:**

1. ✅ **New components** - Must include comprehensive test file
2. ✅ **UI modifications** - Must update existing tests
3. ✅ **Bug fixes** - Must add test case that reproduces the bug
4. ✅ **All tests pass** - Pre-commit hook enforces this

**This ensures:**
- Code quality remains high
- Bugs are caught early
- Refactoring is safe
- Documentation via tests

---

**Questions?** Check [Vitest docs](https://vitest.dev) or [Testing Library docs](https://testing-library.com)
