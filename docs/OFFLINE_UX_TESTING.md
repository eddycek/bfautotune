# Offline UX Testing Mode

> **Status**: Proposed

## Problem

Testing the full tuning workflow UX requires:
1. A real flight controller connected via USB
2. Actual test flights with blackbox recording
3. Downloading blackbox data from flash/SD card
4. Waiting for FC reboots after apply/save operations

This makes it impossible to test UX changes while offline (e.g., traveling without hardware). Many UX issues are only discoverable by clicking through the entire 10-phase tuning workflow, which requires real flights.

## Solution: Demo Mode

A `DEMO_MODE=true` environment variable that boots the app with a simulated flight controller and pre-populated demo data. The real Electron app runs normally — only the MSP layer is replaced with a mock that returns realistic responses, and demo blackbox logs are generated for realistic analysis.

### What Demo Mode Provides

- **Simulated FC connection**: Auto-connects to a virtual "Demo FC" on startup
- **Pre-created demo profile**: 5" freestyle quad with realistic settings
- **Demo blackbox logs**: Generated from `bf45-reference.ts` fixture, parseable by real `BlackboxParser`
- **Real analysis**: `FilterAnalyzer` and `PIDAnalyzer` run on demo data (real FFT, real step detection)
- **Simulated apply**: `applyRecommendations` succeeds without MSP commands, simulates reboot delay
- **Full state machine**: All 10 tuning phases work, including verification and history archival
- **Demo snapshots**: Baseline and auto-snapshots created with realistic CLI diff data

### What Demo Mode Does NOT Change

- All renderer components run unmodified
- All storage managers (profile, snapshot, session, history) use real file I/O
- Blackbox parser and analysis engines run real computation
- Event system works normally (IPC events broadcast to renderer)

## Architecture

### Entry Point

```
npm run dev:demo         # Development (sets DEMO_MODE=true env var)
./app --demo             # Production (CLI flag fallback)
```

Demo mode is detected in `src/main/index.ts` via `process.env.DEMO_MODE === 'true'` (dev) or `process.argv.includes('--demo')` (production fallback). The env var approach is required because `vite-plugin-electron` does not forward CLI args to the Electron process.

### MockMSPClient

A new class `src/main/demo/MockMSPClient.ts` that implements the same interface as `MSPClient` but returns static/simulated data:

| Method | Mock Behavior |
|--------|--------------|
| `listPorts()` | Returns `[{ path: '/dev/demo', manufacturer: 'Demo' }]` |
| `connect()` | Sets connected=true, emits 'connected' after 500ms delay |
| `disconnect()` | Sets connected=false, emits 'disconnected' |
| `isConnected()` | Returns connection state |
| `getFCInfo()` | Returns demo FC info (BTFL 4.5.1, STM32F405) |
| `getFCSerialNumber()` | Returns `'DEMO-001'` |
| `getBlackboxInfo()` | Returns flash storage with simulated used/total size |
| `getFilterConfiguration()` | Returns BF 4.5 default filter settings |
| `getPIDConfiguration()` | Returns standard 5" PID values |
| `setPIDConfiguration()` | No-op, logs to console |
| `downloadBlackboxLog()` | Returns pre-generated demo BBL buffer |
| `eraseBlackboxFlash()` | No-op, resets simulated flash state |
| `saveAndReboot()` | Simulates disconnect → 2s delay → reconnect |
| `exportCLIDiff()` | Returns realistic CLI diff string |
| `getConnectionStatus()` | Returns current status |

### DemoDataGenerator

`src/main/demo/DemoDataGenerator.ts` — generates demo data on first boot:

1. **Demo BBL log**: Uses `buildReferenceFixture()` but with enhanced data:
   - More frames (500+ per session) for meaningful FFT analysis
   - Noise injection (motor harmonics at ~150Hz, electrical at ~600Hz)
   - Step inputs in setpoint data (for PID analysis)
   - Realistic throttle variation (hover ~1500, sweeps 1200-1800)

2. **Demo CLI diff**: Realistic `diff` output with common BF 4.5 settings

3. **Demo FC info**: STM32F405 board, BF 4.5.1, API 1.46

### Integration Point

In `src/main/index.ts`, the `initialize()` function checks for demo mode:

```typescript
async function initialize(): Promise<void> {
  const isDemoMode = process.env.DEMO_MODE === 'true' || process.argv.includes('--demo');

  if (isDemoMode) {
    mspClient = new MockMSPClient() as any;
    // Generate demo data after managers are initialized
  } else {
    mspClient = new MSPClient();
  }

  // ... rest of initialization unchanged ...

  if (isDemoMode) {
    // Auto-trigger connection after window is ready
    setTimeout(() => mspClient.simulateConnect(), 1000);
  }
}
```

### npm Script

```json
{
  "scripts": {
    "dev:demo": "DEMO_MODE=true vite"
  }
}
```

## Implementation Plan

### Task 1: MockMSPClient
- Create `src/main/demo/MockMSPClient.ts`
- EventEmitter-based, same interface as MSPClient
- Static responses for all read operations
- Simulated delays for connect/disconnect/reboot
- Mock `connection` object with `isInCLI()`, `enterCLI()`, `sendCLICommand()`, `exitCLI()`

### Task 2: DemoDataGenerator
- Create `src/main/demo/DemoDataGenerator.ts`
- Enhanced BBL fixture with noise + step inputs (reuses bf45-reference encoding helpers)
- Generate demo CLI diff string
- Save demo BBL to BlackboxManager on first demo boot

### Task 3: Integration in index.ts
- Detect demo mode via `DEMO_MODE` env var or `--demo` CLI flag
- Swap MSPClient with MockMSPClient when demo mode active
- Auto-connect after window ready
- Add `dev:demo` script to package.json

### Task 4: Demo Profile Auto-Setup
- On first demo connect, auto-create "Demo Quad (5" Freestyle)" profile
- Create baseline snapshot with demo CLI diff
- Pre-populate blackbox log from DemoDataGenerator

### Task 5: Tests
- Unit tests for MockMSPClient
- Unit tests for DemoDataGenerator
- Verify demo BBL parses correctly through real BlackboxParser

## Risk Assessment

**Low risk** — Demo mode is completely isolated:
- Only activated by explicit `DEMO_MODE=true` env var or `--demo` CLI flag
- No changes to production code paths (just an `if` branch in `initialize()`)
- All new code in `src/main/demo/` directory
- Real storage managers used (data persists between demo sessions in separate location if needed)

## Files

| File | Action |
|------|--------|
| `src/main/demo/MockMSPClient.ts` | Create |
| `src/main/demo/DemoDataGenerator.ts` | Create |
| `src/main/index.ts` | Modify (add demo mode branch) |
| `package.json` | Modify (add `dev:demo` script) |
| `docs/OFFLINE_UX_TESTING.md` | Create (this doc) |
