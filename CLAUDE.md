# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Betaflight PID AutoTune is an Electron-based desktop application for managing FPV drone PID configurations. It uses MSP (MultiWii Serial Protocol) to communicate with Betaflight flight controllers over USB serial connection.

**Current Phase**: Phase 3 - Analysis Charts + Parser Validation Fixes

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
- Step response analysis: `src/main/analysis/` (PID tuning via step metrics)

**Preload Script** (`src/preload/index.ts`)
- Exposes `window.betaflight` API to renderer
- Type-safe bridge using `@shared/types/ipc.types.ts`
- All main ↔ renderer communication goes through this API

**Renderer Process** (`src/renderer/`)
- React application with hooks-based state management
- No direct IPC access - uses `window.betaflight` API only
- Event subscriptions via `onConnectionChanged`, `onProfileChanged`, `onNewFCDetected`
- Tuning wizard: `src/renderer/components/TuningWizard/` (guided tuning flow)

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

- 10 encoding types, 10 predictor types — validated against BF Explorer (see `docs/BBL_PARSER_VALIDATION.md`)
- Multi-session support (multiple flights per file)
- Corruption recovery aligned with BF Explorer (byte-by-byte, no forward-scan resync)
- **NEG_14BIT encoding**: Uses `-signExtend14Bit(readUnsignedVB())` matching BF Explorer. Sign-extends bit 13, then negates.
- **TAG8_8SVB count==1**: When only 1 field uses this encoding, reads signedVB directly (no tag byte) — matches BF encoder/decoder special case.
- **AVERAGE_2 predictor**: Uses `Math.trunc((prev + prev2) / 2)` for truncation toward zero (C integer division), matching BF Explorer.
- **LOG_END handling**: `parseEventFrame()` returns event type; LOG_END validates "End of log\0" string (anti-false-positive), then terminates session. Matches BF viewer behavior.
- **Event frame parsing**: Uses VB encoding (readUnsignedVB/readSignedVB) for all event data — NOT fixed skip(). SYNC_BEEP=1×UVB, DISARM=1×UVB, FLIGHT_MODE=2×UVB, LOGGING_RESUME=2×UVB, INFLIGHT_ADJUSTMENT=1×U8+conditional.
- **Frame validation** (aligned with BF viewer): structural size limit (256 bytes), iteration continuity (< 5000 jump), time continuity (< 10s jump). No sensor value thresholds — debug/motor fields can legitimately exceed any fixed range. No consecutive corrupt frame limit (matches BF Explorer).
- **Unknown bytes**: Silently skipped at frame boundaries (0x00, 0x02, 0x04 etc. are normal). No corruption counting.
- **Corrupt frame recovery**: Rewind to `frameStart + 1` and continue byte-by-byte (matches BF Explorer). No forward-scan resync.
- IPC: `BLACKBOX_PARSE_LOG` + `EVENT_BLACKBOX_PARSE_PROGRESS`
- Output: `BlackboxFlightData` with gyro, setpoint, PID, motor as `Float64Array` time series

### FFT Analysis Engine (`src/main/analysis/`)

Analyzes gyro noise spectra to produce filter tuning recommendations.

**Pipeline**: SegmentSelector → FFTCompute → NoiseAnalyzer → FilterRecommender → FilterAnalyzer

- **SegmentSelector**: Finds stable hover segments (excludes takeoff/landing/acro)
- **FFTCompute**: Hanning window, Welch's method (50% overlap), power spectral density
- **NoiseAnalyzer**: Noise floor estimation, peak detection (prominence-based), source classification (frame resonance 80-200 Hz, motor harmonics, electrical >500 Hz)
- **FilterRecommender**: Absolute noise-based target computation (convergent), safety bounds, beginner-friendly explanations
- **FilterAnalyzer**: Orchestrator with async progress reporting
- IPC: `ANALYSIS_RUN_FILTER` + `EVENT_ANALYSIS_PROGRESS`
- Dependency: `fft.js`
- Constants in `src/main/analysis/constants.ts` (tunable thresholds)

### Step Response Analysis Engine (`src/main/analysis/`)

Analyzes step response metrics from setpoint/gyro data to produce PID tuning recommendations.

**Pipeline**: StepDetector → StepMetrics → PIDRecommender → PIDAnalyzer

- **StepDetector**: Derivative-based step input detection in setpoint data, hold/cooldown validation
- **StepMetrics**: Rise time, overshoot percentage, settling time, latency, ringing measurement
- **PIDRecommender**: Flight-PID-anchored P/D recommendations (convergent), `extractFlightPIDs()` from BBL header, safety bounds (P: 20-120, D: 15-80)
- **PIDAnalyzer**: Orchestrator with async progress reporting, threads `flightPIDs` through pipeline
- IPC: `ANALYSIS_RUN_PID` + `EVENT_ANALYSIS_PROGRESS`

### Tuning Wizard (`src/renderer/components/TuningWizard/`)

Guided multi-step wizard for automated tuning workflow.

**Steps**: Flight Guide → Session Select → Filter Analysis → PID Analysis → Summary

- **useTuningWizard hook**: State management for parse/filter/PID analysis and apply lifecycle
- **WizardProgress**: Visual step indicator with done/current/upcoming states
- **FlightGuideContent**: Shared flight phase instructions (hover, roll/pitch/yaw snaps)
- **ApplyConfirmationModal**: Confirmation dialog before applying changes (snapshot option, reboot warning)
- **TuningWorkflowModal**: Standalone modal for tuning preparation guide
- Flight guide data in `src/shared/constants/flightGuide.ts`
- Triggered from BlackboxStatus component when log is available

### Analysis Charts (`src/renderer/components/TuningWizard/charts/`)

Interactive visualization of analysis results using Recharts (SVG).

- **SpectrumChart**: FFT noise spectrum with per-axis color coding, noise floor reference lines, peak frequency markers. Integrated in FilterAnalysisStep noise details (collapsible).
- **StepResponseChart**: Setpoint vs gyro trace for individual steps, Prev/Next step navigation, metrics overlay (overshoot, rise time, settling, latency). Integrated in PIDAnalysisStep (collapsible).
- **AxisTabs**: Shared tab selector (Roll/Pitch/Yaw/All) for both charts
- **chartUtils**: Data conversion utilities (Float64Array → Recharts format), downsampling, findBestStep scoring
- **StepResponseTrace**: Raw trace data (timeMs, setpoint, gyro arrays) extracted in `StepMetrics.computeStepResponse()` and attached to each `StepResponse`
- Dependency: `recharts`

### Auto-Apply Recommendations

**Apply Flow** (orchestrated in `TUNING_APPLY_RECOMMENDATIONS` IPC handler):
1. Stage 1: Apply PID changes via MSP (must happen before CLI mode)
2. Stage 2: Create pre-tuning safety snapshot (enters CLI mode)
3. Stage 3: Apply filter changes via CLI `set` commands
4. Stage 4: Save to EEPROM and reboot FC

**MSP Filter Config** (`MSP_FILTER_CONFIG`, command 92):
- Reads current filter settings directly from FC (gyro LPF1/2, D-term LPF1/2, dynamic notch)
- Auto-read in analysis handlers when FC connected and settings not provided
- Byte layout verified against betaflight-configurator MSPHelper.js

**MSP Dataflash Read** (`MSP_DATAFLASH_READ`, command 0x46):
- Response format: `[4B readAddress LE][2B dataSize LE][1B isCompressed (BF4.1+)][flash data]`
- `MSPClient.extractFlashPayload()` strips the 6-7 byte header, returns only flash data
- Both 6-byte (no compression flag) and 7-byte (with compression flag) formats supported
- Huffman compression not yet implemented (logs warning if detected)

**Important**: Stage ordering matters — MSP commands must execute before CLI mode, because FC only processes CLI input while in CLI mode (MSP timeouts). Snapshot creation enters CLI mode via `exportCLIDiff()`.

### Snapshot Restore (Rollback)

**Restore Flow** (orchestrated in `SNAPSHOT_RESTORE` IPC handler):
1. Load snapshot and parse `cliDiff` — extract restorable CLI commands
2. Stage 1 (backup): Create "Pre-restore (auto)" safety snapshot
3. Stage 2 (cli): Enter CLI mode, send each command
4. Stage 3 (save): Save and reboot FC

**Restorable commands**: `set`, `feature`, `serial`, `aux`, `beacon`, `map`, `resource`, `timer`, `dma` — everything except identity (`board_name`, `mcu_id`), control (`diff`, `batch`, `defaults`, `save`), and profile selection commands.

**CLI prompt detection fix** (`MSPConnection.sendCLICommand`): Previously used `data.includes('#')` which false-matched `# comment` lines in `diff all` output, truncating snapshots. Fixed to check accumulated buffer ending with `\n#` (actual CLI prompt).

## Testing Requirements

**Mandatory**: All UI changes require tests. Pre-commit hook enforces this.

### Test Coverage
- 711 tests total across 39 test files
- UI Components: ConnectionPanel, ProfileSelector, FCInfoDisplay, SnapshotManager, SnapshotDiffModal, ProfileEditModal, ProfileDeleteModal, BlackboxStatus, Toast, ToastContainer, TuningWizard, ApplyConfirmationModal, TuningWorkflowModal
- Snapshot Diff: snapshotDiffUtils, SnapshotDiffModal (38 tests)
- Charts: SpectrumChart, StepResponseChart, chartUtils (30 tests)
- Hooks: useConnection, useProfiles, useSnapshots, useTuningWizard
- MSP Client: MSPClient (8 tests - filter config parsing, flash payload extraction)
- Blackbox Parser: BlackboxParser, StreamReader, HeaderParser, ValueDecoder, PredictorApplier, FrameParser (205 tests, incl. integration)
- FFT Analysis: FFTCompute, SegmentSelector, NoiseAnalyzer, FilterRecommender, FilterAnalyzer (98 tests)
- Step Response Analysis: StepDetector, StepMetrics, PIDRecommender, PIDAnalyzer (69 tests)
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
- **Restore** sends `set` commands from snapshot CLI diff to FC via CLI, then saves and reboots
- **Restore safety backup** auto-creates "Pre-restore (auto)" snapshot before applying
- **Server-side filtering** by current profile's snapshotIds
- **Compare** shows diff between snapshot and previous one (or empty config for oldest). Uses `snapshotDiffUtils.ts` to parse CLI diff, compute changes, and group by command type. Displayed in `SnapshotDiffModal` with GitHub-style color coding (green=added, red=removed, yellow=changed).

### Event-Driven UI Updates
Renderer components subscribe to events:
- `onConnectionChanged` → reload snapshots after connect, clear on disconnect
- `onProfileChanged` → reload snapshots for new profile, clear if null
- `onNewFCDetected` → show ProfileWizard modal

## Configuration & Constants

### Important Files
- `src/shared/constants.ts` - MSP codes, Betaflight vendor IDs, preset profiles, size defaults
- `src/shared/types/*.types.ts` - Shared type definitions (common, profile, pid, blackbox, analysis)
- `src/shared/constants/flightGuide.ts` - Flight guide phases, tips, and tuning workflow steps
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
