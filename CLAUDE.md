# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Beta PIDTune is an Electron-based desktop application for managing FPV drone PID configurations. It uses MSP (MultiWii Serial Protocol) to communicate with Betaflight flight controllers over USB serial connection.

**Current Phase**: Phase 2 - Blackbox Analysis System (automated filter & PID tuning)

**Tech Stack**: Electron + TypeScript + React + Vite + serialport + fft.js

## Development Commands

### Essential Commands
```bash
# Start development with hot reload
npm run dev

# Run tests (watch mode)
npm test

# Run tests once (pre-commit)
npm run test:run

# Interactive test UI
npm run test:ui

# Build for production
npm run build

# Rebuild native modules (serialport)
npm run rebuild
```

### After Native Module Changes
If serialport or other native modules fail:
```bash
npm run rebuild
```

## Architecture

### Electron Process Model

**Main Process** (`src/main/`)
- Entry point: `src/main/index.ts`
- Manages MSPClient, ProfileManager, SnapshotManager, BlackboxManager
- Handles IPC communication via `src/main/ipc/handlers.ts`
- Event-driven architecture: MSPClient emits events → IPC sends to renderer
- Blackbox parsing: `src/main/blackbox/` (BBL binary log parser)
- FFT analysis: `src/main/analysis/` (noise analysis & filter tuning)

**Preload Script** (`src/preload/index.ts`)
- Exposes `window.betaflight` API to renderer
- Type-safe bridge using `@shared/types/ipc.types.ts`
- All main ↔ renderer communication goes through this API

**Renderer Process** (`src/renderer/`)
- React application with hooks-based state management
- No direct IPC access - uses `window.betaflight` API only
- Event subscriptions via `onConnectionChanged`, `onProfileChanged`, `onNewFCDetected`

### Multi-Drone Profile System

**Profile Detection Flow**:
1. User connects FC via USB
2. MSPClient reads FC serial number (UID)
3. ProfileManager checks if profile exists for this serial
4. If exists → auto-select profile, create baseline snapshot if missing
5. If new FC → show ProfileWizard modal (cannot be cancelled)

**Profile-Snapshot Linking**:
- Each profile has `snapshotIds: string[]` array
- Snapshots are filtered by current profile
- Deleting profile deletes all associated snapshots
- Baseline snapshot created automatically on first connection

**Profile Locking**:
- When FC connected, profile switching is disabled in UI
- Prevents data corruption from profile mismatch
- Implemented in `ProfileSelector.tsx` using connection status

### MSP Communication

**MSP Protocol Layer** (`src/main/msp/`):
- `MSPProtocol.ts` - Low-level packet encoding/decoding
- `MSPConnection.ts` - Serial port handling, CLI mode switching
- `MSPClient.ts` - High-level API with retry logic

**Important MSP Behaviors**:
- FC may be stuck in CLI mode from previous session → `forceExitCLI()` on connect
- CLI commands don't exit CLI mode automatically (prevents port closure on some FCs)
- Board name may be empty/invalid → fallback to target name
- Connection requires 500ms stabilization delay after port open
- Retry logic: 2 attempts with reset between failures

### IPC Architecture

**Request-Response Pattern**:
```typescript
// Renderer → Main
const response = await window.betaflight.someMethod(params);
// Returns: IPCResponse<T> = { success: boolean, data?: T, error?: string }
```

**Event Broadcasting**:
```typescript
// Main → Renderer
mspClient.on('connection-changed', (status) => {
  sendConnectionChanged(window, status);
});

// Renderer subscribes
window.betaflight.onConnectionChanged((status) => {
  // Handle status update
});
```

### Storage System

**Profile Storage** (`ProfileManager.ts`):
- Location: `{userData}/data/profiles/`
- One JSON file per profile: `{profileId}.json`
- Metadata index: `profiles.json` (list of all profiles)
- Current profile ID: `current-profile.txt`

**Snapshot Storage** (`SnapshotManager.ts`):
- Location: `{userData}/data/snapshots/`
- One JSON file per snapshot: `{snapshotId}.json`
- Contains: FC info, CLI diff, timestamp, label, type (baseline/manual/auto)
- Snapshots are linked to profiles via `snapshotIds` array

**Critical**: Snapshot filtering happens server-side (main process) based on current profile's `snapshotIds` array. This prevents snapshots from different profiles mixing in UI.

### Blackbox Parser (`src/main/blackbox/`)

Parses Betaflight .bbl/.bfl binary log files into typed time series data.

**Pipeline**: StreamReader → HeaderParser → ValueDecoder → PredictorApplier → FrameParser → BlackboxParser

- 10 encoding types, 10 predictor types
- Multi-session support (multiple flights per file)
- Corruption recovery with resync
- IPC: `BLACKBOX_PARSE_LOG` + `EVENT_BLACKBOX_PARSE_PROGRESS`
- Output: `BlackboxFlightData` with gyro, setpoint, PID, motor as `Float64Array` time series

### FFT Analysis Engine (`src/main/analysis/`)

Analyzes gyro noise spectra to produce filter tuning recommendations.

**Pipeline**: SegmentSelector → FFTCompute → NoiseAnalyzer → FilterRecommender → FilterAnalyzer

- **SegmentSelector**: Finds stable hover segments (excludes takeoff/landing/acro)
- **FFTCompute**: Hanning window, Welch's method (50% overlap), power spectral density
- **NoiseAnalyzer**: Noise floor estimation, peak detection (prominence-based), source classification (frame resonance 80-200 Hz, motor harmonics, electrical >500 Hz)
- **FilterRecommender**: Rule-based recommendations with safety bounds (min gyro LPF 100 Hz, min D-term LPF 80 Hz), beginner-friendly explanations
- **FilterAnalyzer**: Orchestrator with async progress reporting
- IPC: `ANALYSIS_RUN_FILTER` + `EVENT_ANALYSIS_PROGRESS`
- Dependency: `fft.js`
- Constants in `src/main/analysis/constants.ts` (tunable thresholds)

## Testing Requirements

**Mandatory**: All UI changes require tests. Pre-commit hook enforces this.

### Test Coverage
- 429 tests total across 24 test files
- UI Components: ConnectionPanel, ProfileSelector, FCInfoDisplay, SnapshotManager, ProfileEditModal, ProfileDeleteModal
- Hooks: useConnection, useProfiles, useSnapshots
- Blackbox Parser: BlackboxParser, StreamReader, HeaderParser, ValueDecoder, PredictorApplier, FrameParser (171 tests)
- FFT Analysis: FFTCompute, SegmentSelector, NoiseAnalyzer, FilterRecommender, FilterAnalyzer (91 tests)
- See `TESTING.md` for detailed guidelines

### Mock Setup
Tests use `src/renderer/test/setup.ts` which mocks `window.betaflight` API. Key points:
- Mock all API methods before each test with `vi.mocked(window.betaflight.method)`
- Mock event subscriptions return cleanup functions: `() => {}`
- Use `waitFor()` for async state updates
- Use `getByRole()` for accessibility-compliant queries

### Common Test Patterns
```typescript
// Component test
const user = userEvent.setup();
render(<Component />);
await waitFor(() => {
  expect(screen.getByText('Expected')).toBeInTheDocument();
});

// Hook test
const { result } = renderHook(() => useYourHook());
await waitFor(() => {
  expect(result.current.data).toBeDefined();
});
```

## Key Behaviors & Gotchas

### Connection Flow
1. **Port scanning** filters by Betaflight vendor IDs (fallback to all if none found)
2. **Auto port selection** - if selected port disappears, auto-select first available
3. **3-second cooldown** after disconnect to prevent "FC not responding" errors
4. **1-second backend delay** in disconnect for port release
5. **Port rescan** 1.5s after disconnect to detect new FC

### Profile Management
- **Cannot cancel ProfileWizard** - profile creation is mandatory for new FC
- **Active profile deletion** allowed - disconnects FC automatically
- **Profile switching** disabled when FC connected (UI lock with visual indicator)
- **Preset profiles** available in `@shared/constants.ts` (10 common drone types)

### Snapshot Behavior
- **Baseline** type cannot be deleted via UI
- **Auto-created baseline** when profile first connects
- **Export** downloads CLI diff as `.txt` file
- **Server-side filtering** by current profile's snapshotIds

### Event-Driven UI Updates
Renderer components subscribe to events:
- `onConnectionChanged` → reload snapshots after connect, clear on disconnect
- `onProfileChanged` → reload snapshots for new profile, clear if null
- `onNewFCDetected` → show ProfileWizard modal

## Configuration & Constants

### Important Files
- `src/shared/constants.ts` - MSP codes, Betaflight vendor IDs, preset profiles, size defaults
- `src/shared/types/*.types.ts` - Shared type definitions (common, profile, pid, blackbox, analysis)
- `src/main/analysis/constants.ts` - FFT thresholds, peak detection, safety bounds (tunable)
- `vitest.config.ts` - Test configuration with jsdom environment

### Size Defaults
When user selects drone size, defaults auto-populate:
- 1" → 25g, 19000KV, 1S
- 5" → 650g, 2400KV, 4S
- etc. (see `SIZE_DEFAULTS` in constants)

### Preset Profiles
10 presets available: tiny-whoop, micro-whoop, 4inch-toothpick, 5inch-freestyle, 5inch-race, 5inch-cinematic, 6inch-longrange, 7inch-longrange, 3inch-cinewhoop, 10inch-ultra-longrange

## Common Issues

### "FC not responding to MSP commands"
- Caused by immediate reconnect before port fully released
- Fixed with 3s cooldown + 1s backend delay
- User sees countdown timer in UI

### Board name showing as target
- BoardName field may be empty/corrupted from FC
- MSPClient filters null bytes and falls back to target
- UI shows Board only if different from Target

### Snapshots from wrong profile visible
- Caused by client-side filtering (old bug)
- Fixed: server-side filtering in `SNAPSHOT_LIST` IPC handler
- Uses `currentProfile.snapshotIds` array

### Tests failing with "not wrapped in act(...)"
- React state updates in tests need `waitFor()`
- Don't check loading state immediately after action
- Use `await waitFor(() => expect(loading).toBe(true))`

## Code Style

### File Organization
- Place test files next to components: `Component.tsx` + `Component.test.tsx`
- Separate CSS files: `Component.css`
- Hooks in `src/renderer/hooks/`
- Shared types in `src/shared/types/`

### React Patterns
- Functional components with hooks
- Custom hooks for business logic (useConnection, useProfiles, useSnapshots)
- No prop drilling - use event subscriptions for cross-component communication
- Loading/error states in all async operations

### Error Handling
- Main process: throw descriptive errors with context
- IPC handlers: catch errors, return `IPCResponse` with error message
- Renderer: display errors in UI, log to console
- MSP operations: retry logic with recovery attempts

## Platform-Specific Notes

### macOS
- Serial ports: `/dev/tty.usbmodem*`
- Requires Xcode Command Line Tools for native modules
- Port permissions may need `chmod 666`

### Windows
- Serial ports: `COM*`
- Requires STM32 VCP drivers
- Visual Studio Build Tools needed for native modules

### Linux
- Serial ports: `/dev/ttyUSB*` or `/dev/ttyACM*`
- User may need to be in `dialout` group
- Requires `build-essential` package
