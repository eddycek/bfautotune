# Betaflight PID AutoTune

**Desktop application that takes the guesswork out of FPV drone tuning.**

Most pilots tune their drones by hand — changing PID numbers, test flying, reading Blackbox graphs, and repeating. It's slow, confusing, and error-prone.

BFAutoTune connects to your Betaflight flight controller over USB, guides you through two short test flights, analyzes the Blackbox data automatically (FFT noise analysis for filters, step response metrics for PIDs), and applies optimized settings with one click. No graph reading, no spreadsheets, no guesswork.

**How it works:** Connect FC → Fly hover + throttle sweeps → App tunes filters → Fly stick snaps → App tunes PIDs → Done.

## Download

Pre-built binaries are available on the [Releases](https://github.com/eddycek/bfautotune/releases) page:

| Platform | Format | File |
|----------|--------|------|
| **macOS** | Disk Image | `Betaflight.PID.AutoTune-*.dmg` |
| **Windows** | Installer | `Betaflight.PID.AutoTune-Setup-*.exe` |
| **Linux** | AppImage | `Betaflight.PID.AutoTune-*.AppImage` |

> **Note:** macOS builds are currently unsigned. On first launch, right-click the app and select **Open**, or run `xattr -cr /Applications/Betaflight\ PID\ AutoTune.app` in Terminal to bypass Gatekeeper.

## Supported Betaflight Versions

| Tier | Version | Notes |
|------|---------|-------|
| **Minimum** | BF 4.3 (API 1.44) | Oldest supported — connects and works |
| **Recommended** | BF 4.5+ (API 1.46) | Best feature coverage |
| **Actively tested** | BF 4.5.x, 2025.12.x | User's fleet |

Connecting with BF 4.2 or earlier will show an error and auto-disconnect. See [BF Version Policy](./docs/BF_VERSION_POLICY.md) for detailed rationale and version-specific notes.

## Current Status

- **Phase 1:** ✅ Complete - MSP connection, profile management, snapshots
- **Phase 2:** ✅ Complete - Blackbox analysis, automated tuning, rollback
- **Phase 2.5:** ✅ Complete - Profile simplification, interactive analysis charts
- **Phase 3:** ✅ Complete - Mode-aware wizard, read-only analysis, flight guides
- **Phase 4:** ✅ Complete - Stateful two-flight tuning workflow
- **Phase 6:** ✅ Complete - CI/CD with GitHub Actions (tests on PR, cross-platform releases on tag)

See [SPEC.md](./SPEC.md) for detailed phase tracking and test counts.

## Features

### Connection & Profiles
- USB serial connection to Betaflight flight controllers (MSP protocol)
- Multi-drone profile management with automatic FC detection by serial number
- Profile auto-selection on connect, profile locking while FC is connected
- 10 preset profiles (Tiny Whoop, 5" Freestyle, 7" Long Range, etc.)
- Cross-platform (Windows, macOS, Linux)

### Configuration Management
- CLI export (diff/dump) for full configuration backup
- Configuration snapshots with versioning and comparison
- Snapshot restore/rollback via CLI command replay
- GitHub-style diff view for snapshot comparison

### Blackbox Analysis
- Blackbox log download from FC flash storage (adaptive chunking)
- Binary BBL log parser (validated against BF Explorer, 245 tests)
- Multi-session support (multiple flights per file)
- FC diagnostics: debug_mode, logging rate, and feedforward configuration display with warnings + one-click fix

### Automated Tuning
- **Filter tuning**: FFT noise analysis (Welch's method, Hanning window, peak detection)
- **PID tuning**: Step response analysis (rise time, overshoot, settling, ringing)
- **Flight style preferences**: Smooth (cinematic), Balanced (freestyle), or Aggressive (racing) — PID thresholds adapt to pilot preference
- **RPM filter awareness**: Detects RPM filter state via MSP or BBL headers, widens safety bounds when active (gyro LPF1 up to 500 Hz), recommends dynamic notch optimization (count/Q), diagnoses motor harmonic anomalies
- **Feedforward awareness**: Detects FF state from BBL headers, classifies FF-dominated overshoot, adjusts P/D recommendations accordingly
- **Data quality scoring**: Rates input flight data 0-100 (excellent/good/fair/poor), adjusts recommendation confidence based on data quality, warns about insufficient hover time, missing axes, or too few steps
- Convergent recommendations (idempotent - rerunning produces same result)
- Safety bounds prevent extreme values, plain-English explanations
- One-click apply with automatic safety snapshot

### Two-Flight Guided Workflow
- Stateful tuning session: filters first (hover + throttle sweeps), then PIDs (stick snaps)
- Step-by-step banner with progress indicator (10 phases including optional verification)
- Smart reconnect detection: auto-advances when flight data detected
- Post-erase guidance: flash erased notification with flight guide
- Mode-aware wizard adapts UI for filter vs PID analysis
- Optional verification hover after PID apply for before/after noise comparison
- Tuning completion summary with applied changes, noise metrics, and PID response data

### Tuning History
- Archived tuning records per profile (persistent across sessions)
- Before/after noise spectrum overlay with dB delta indicators
- Applied filter and PID changes table with old → new values
- Expandable history cards on the dashboard

### Interactive Charts
- FFT spectrum chart (noise per axis, floor lines, peak markers)
- Step response chart (setpoint vs gyro trace, metrics overlay)
- Axis tabs (Roll/Pitch/Yaw/All) for both chart types

## Tech Stack

- **Electron** - Desktop application framework
- **TypeScript** - Type-safe development
- **React** - UI framework
- **Vite** - Fast build tool
- **serialport** - USB serial communication
- **MSP Protocol** - Betaflight communication protocol
- **fft.js** - FFT computation for noise analysis
- **Recharts** - SVG-based interactive analysis charts
- **ESLint** + **Prettier** - Code linting and formatting (lint-staged pre-commit)

## Installation

### Prerequisites

- Node.js 20+ and npm
- Python 3 (for native module compilation)
- Build tools:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Visual Studio Build Tools or windows-build-tools
  - **Linux**: `build-essential` package

### Setup

1. Clone the repository:
```bash
git clone https://github.com/eddycek/bfautotune.git
cd bfautotune
```

2. Install dependencies:
```bash
npm install
```

3. Rebuild native modules for Electron:
```bash
npm run rebuild
```

## Development

Start the development server:
```bash
npm run dev
```

This will:
- Start Vite dev server for hot reload
- Launch Electron with the app
- Open DevTools automatically

### Demo Mode (No Hardware Needed)

Start the app with a simulated flight controller for offline UX testing:
```bash
npm run dev:demo
```

Demo mode auto-connects to a virtual FC, creates a demo profile, and generates realistic blackbox data. The full 10-phase tuning workflow is functional — real FFT and step response analysis runs on the simulated data. See [docs/OFFLINE_UX_TESTING.md](./docs/OFFLINE_UX_TESTING.md) for details.

### Testing

All UI changes must include tests. Tests automatically run before commits. Coverage thresholds enforced: 80% lines/functions/statements, 75% branches.

**Unit tests:** 1895 tests across 96 files — MSP protocol, storage managers, IPC handlers, UI components, hooks, BBL parser fuzz, analysis pipeline validation, E2E workflows.

**Playwright E2E:** 16 tests across 3 spec files — launches real Electron app in demo mode, walks through complete tuning cycles.

```bash
# Run unit tests in watch mode
npm test

# Run unit tests once
npm run test:run

# Open interactive test UI
npm run test:ui

# Generate coverage report
npm run test:coverage

# Run E2E tests (builds app, then runs Playwright)
npm run test:e2e

# Run E2E with Playwright UI
npm run test:e2e:ui

# Generate 5 tuning sessions for demo screenshots (~2 min)
npm run demo:generate-history
```

See [TESTING.md](./TESTING.md) for complete testing guidelines, test inventory, and best practices. See [docs/COMPREHENSIVE_TESTING_PLAN.md](./docs/COMPREHENSIVE_TESTING_PLAN.md) for the full testing plan and architecture.

## Building

Build the application for your platform:
```bash
npm run build
```

Output will be in the `release/` directory.

### Releasing

Releases are automated via GitHub Actions. To create a new release:

```bash
# Update version in package.json, then:
git tag v0.2.0
git push origin v0.2.0
```

This triggers the release workflow which builds native installers for macOS (`.dmg`), Windows (`.exe`), and Linux (`.AppImage`), then uploads them as a draft GitHub Release. Review the draft and publish it manually.

## Project Structure

```
bfautotune/
├── src/
│   ├── main/                    # Main process (Node.js)
│   │   ├── index.ts             # Entry point, event wiring
│   │   ├── window.ts            # Window management
│   │   ├── msp/                 # MSP communication
│   │   │   ├── MSPClient.ts     # High-level MSP API (connect, read/write, download)
│   │   │   ├── MSPConnection.ts # Serial port + CLI mode + reboot handling
│   │   │   ├── MSPProtocol.ts   # Protocol encoding/decoding (MSP v1)
│   │   │   ├── commands.ts      # MSP command definitions
│   │   │   └── types.ts         # MSP type definitions
│   │   ├── blackbox/            # BBL binary log parser (6 modules, 245 tests)
│   │   ├── analysis/            # FFT noise + step response analysis (11 modules, FF-aware)
│   │   │   ├── FFTCompute.ts        # Welch's method, Hanning window
│   │   │   ├── SegmentSelector.ts   # Hover segment detection
│   │   │   ├── NoiseAnalyzer.ts     # Peak detection, noise classification
│   │   │   ├── FilterRecommender.ts # Noise-based filter targets
│   │   │   ├── FilterAnalyzer.ts    # Filter analysis orchestrator
│   │   │   ├── StepDetector.ts      # Step input detection in setpoint
│   │   │   ├── StepMetrics.ts       # Rise time, overshoot, settling, FF classification
│   │   │   ├── PIDRecommender.ts    # Flight-PID-anchored P/D recommendations, FF-aware
│   │   │   ├── PIDAnalyzer.ts       # PID analysis orchestrator (FF context wiring)
│   │   │   ├── DataQualityScorer.ts # Flight data quality scoring (0-100)
│   │   │   ├── headerValidation.ts  # BB header diagnostics
│   │   │   └── constants.ts         # Tunable thresholds
│   │   ├── storage/             # Data managers
│   │   │   ├── ProfileManager.ts        # Multi-drone profile CRUD
│   │   │   ├── ProfileStorage.ts        # File-based profile storage
│   │   │   ├── SnapshotManager.ts       # Configuration snapshots
│   │   │   ├── BlackboxManager.ts       # BB log file management
│   │   │   ├── TuningSessionManager.ts  # Tuning session state machine
│   │   │   ├── TuningHistoryManager.ts # Tuning history archive
│   │   │   └── FileStorage.ts           # Generic file storage utilities
│   │   ├── demo/               # Demo mode (offline UX testing)
│   │   │   ├── MockMSPClient.ts       # Simulated FC (47 tests)
│   │   │   └── DemoDataGenerator.ts   # Realistic BBL generation (22 tests)
│   │   ├── ipc/                 # IPC handlers
│   │   │   ├── handlers/       # Domain-split handler modules (11 files)
│   │   │   │   ├── index.ts            # DI container, registerIPCHandlers
│   │   │   │   ├── types.ts            # HandlerDependencies interface
│   │   │   │   ├── events.ts           # Event broadcast functions
│   │   │   │   ├── connectionHandlers.ts
│   │   │   │   ├── fcInfoHandlers.ts
│   │   │   │   ├── snapshotHandlers.ts
│   │   │   │   ├── profileHandlers.ts
│   │   │   │   ├── pidHandlers.ts
│   │   │   │   ├── blackboxHandlers.ts
│   │   │   │   ├── analysisHandlers.ts
│   │   │   │   └── tuningHandlers.ts
│   │   │   └── channels.ts     # Channel definitions
│   │   └── utils/               # Logger, error types
│   │
│   ├── preload/                 # Preload script
│   │   └── index.ts             # window.betaflight API bridge
│   │
│   ├── renderer/                # Renderer process (React)
│   │   ├── App.tsx              # Main layout, session routing
│   │   ├── components/
│   │   │   ├── ConnectionPanel/       # Port selection, connect/disconnect
│   │   │   ├── FCInfo/                # FC details + BB diagnostics + FixSettingsConfirmModal
│   │   │   ├── BlackboxStatus/        # Flash storage, download, erase
│   │   │   ├── SnapshotManager/       # Snapshot CRUD, diff view, restore
│   │   │   ├── TuningWizard/          # Multi-step guided wizard
│   │   │   │   ├── charts/            # SpectrumChart, StepResponseChart, AxisTabs
│   │   │   │   ├── FilterAnalysisStep, PIDAnalysisStep  # Analysis result views
│   │   │   │   ├── SessionSelectStep, TestFlightGuideStep # Pre-analysis steps
│   │   │   │   ├── TuningSummaryStep, WizardProgress     # Summary + progress
│   │   │   │   ├── RecommendationCard, ApplyConfirmationModal
│   │   │   │   └── FlightGuideContent # Flight phase instructions
│   │   │   ├── TuningStatusBanner/    # Workflow progress banner
│   │   │   ├── AnalysisOverview/      # Read-only analysis view
│   │   │   ├── TuningHistory/         # History panel + completion summary
│   │   │   │   ├── TuningHistoryPanel, TuningSessionDetail
│   │   │   │   ├── TuningCompletionSummary  # Replaces banner on completion
│   │   │   │   ├── NoiseComparisonChart     # Before/after spectrum overlay
│   │   │   │   └── AppliedChangesTable      # Setting changes with % diff
│   │   │   ├── TuningWorkflowModal/   # Two-flight workflow help
│   │   │   ├── Toast/                 # Toast notification system
│   │   │   ├── ProfileWizard.tsx      # New FC profile creation wizard
│   │   │   ├── ProfileSelector.tsx    # Profile switching dropdown
│   │   │   ├── ErrorBoundary.tsx      # React error boundary (crash recovery)
│   │   │   ├── ProfileCard.tsx        # Individual profile display
│   │   │   ├── ProfileEditModal.tsx   # Profile editing dialog
│   │   │   └── ProfileDeleteModal.tsx # Profile deletion confirmation
│   │   ├── hooks/               # React hooks (11)
│   │   │   ├── useConnection.ts       # Connection state management
│   │   │   ├── useProfiles.ts         # Profile CRUD operations
│   │   │   ├── useSnapshots.ts        # Snapshot management
│   │   │   ├── useTuningSession.ts    # Tuning session lifecycle
│   │   │   ├── useTuningWizard.ts     # Wizard state (parse/analyze/apply)
│   │   │   ├── useAnalysisOverview.ts # Read-only analysis state
│   │   │   ├── useTuningHistory.ts    # Tuning history loading
│   │   │   ├── useBlackboxInfo.ts     # BB flash info
│   │   │   ├── useBlackboxLogs.ts     # BB log list
│   │   │   ├── useFCInfo.ts           # FC info polling
│   │   │   └── useToast.ts            # Toast context consumer
│   │   ├── utils/               # Renderer utilities
│   │   │   └── bbSettingsUtils.ts     # BB settings status computation
│   │   ├── contexts/            # React contexts
│   │   │   └── ToastContext.tsx
│   │   └── test/                # Test setup
│   │       └── setup.ts         # window.betaflight mock
│   │
│   └── shared/                  # Shared types & constants
│       ├── types/               # TypeScript interfaces (9 type files)
│       ├── utils/               # Shared utilities (metrics extraction, spectrum downsampling)
│       └── constants/           # MSP codes, presets, flight guides
│
├── e2e/                         # Playwright E2E tests (demo mode)
│   ├── electron-app.ts          # Shared fixture (launchDemoApp, helpers)
│   ├── demo-smoke.spec.ts       # 4 smoke tests
│   ├── demo-tuning-cycle.spec.ts  # 11 tuning cycle tests
│   └── demo-generate-history.spec.ts  # 5-cycle history generator
│
└── docs/                        # Design docs (see docs/README.md for full index)
    ├── BBL_PARSER_VALIDATION.md             # Parser validation against BF Explorer
    ├── BF_VERSION_POLICY.md                 # BF version compatibility policy
    ├── COMPREHENSIVE_TESTING_PLAN.md        # 9-phase testing plan
    ├── FEEDFORWARD_AWARENESS.md             # FF detection, warnings, recommendations
    ├── FLIGHT_STYLE_PROFILES.md             # Smooth/Balanced/Aggressive flight styles
    ├── RPM_FILTER_AWARENESS.md              # RPM filter detection and bounds
    ├── TUNING_HISTORY_AND_COMPARISON.md     # Session history + before/after comparison
    ├── TUNING_WORKFLOW_REVISION.md          # Two-flight tuning workflow design
    ├── TUNING_WORKFLOW_FIXES.md             # Download/analyze fix + phase transitions
    ├── TUNING_PRECISION_IMPROVEMENTS.md     # Research: tuning accuracy improvements
    └── UX_IMPROVEMENT_IDEAS.md              # UX improvement backlog
```

## Usage

### 1. First Connection & Profile Setup

1. Connect your flight controller via USB
2. Click **Scan** to detect available serial ports
3. Select your FC from the dropdown and click **Connect**
4. On first connection with a new FC, the **Profile Wizard** opens automatically:
   - Choose a preset profile (e.g., "5 inch Freestyle") or create a custom one
   - Enter drone name, size, weight, motor KV, battery config
   - Profile is linked to the FC's unique serial number
5. A **baseline snapshot** is created automatically, capturing the FC's current configuration

On subsequent connections, the app recognizes the FC by serial number and auto-selects the correct profile.

### 2. Pre-Flight Setup

Before flying, check the **Flight Controller Information** panel:

- **Debug Mode** should be `GYRO_SCALED` for noise analysis — **BF 4.3–4.5 only** (not needed on BF 2025.12+, hidden automatically)
- **Logging Rate** should be at least 2 kHz (shown with green checkmark or amber warning)
- **Feedforward** section shows current FF configuration read from FC (boost, per-axis gains, smoothing, jitter factor, transition, max rate limit)

If settings are wrong, click **Fix Settings** in the FC info panel — the app sends the CLI commands and reboots the FC automatically. During an active tuning session, the **TuningStatusBanner** also shows an amber pre-flight warning with a one-click fix button.

### 3. Guided Two-Flight Tuning

Click **Start Tuning Session** to begin the guided workflow. The status banner at the top tracks your progress through 10 phases:

#### Flight 1: Filter Tuning
1. **Erase Flash** — Clear old Blackbox data before flying
2. **Fly filter test flight** — Hover with gentle throttle sweeps (30-60 seconds)
3. **Reconnect** — App auto-detects new flight data on reconnect
4. **Download log** — Download Blackbox data from FC
5. **Analyze** — Click Analyze to open the filter wizard:
   - Auto-parses the log and runs FFT noise analysis
   - Shows noise spectrum, detected peaks, and filter recommendations
   - Review recommendations, then click **Apply Filters** (creates safety snapshot + reboots FC)

#### Flight 2: PID Tuning
6. **Erase Flash** — Clear flash for the PID test flight
7. **Fly PID test flight** — Sharp stick snaps on all axes (roll, pitch, yaw)
8. **Reconnect & download** — Same as above
9. **Analyze** — Opens the PID wizard:
   - Detects step inputs, measures response metrics (overshoot, rise time, settling)
   - Shows step response charts and PID recommendations
   - Click **Apply PIDs** to apply changes

#### Optional: Verification Hover
10. After PID apply, the banner offers an optional **verification hover** (30s gentle hover)
11. If flown, the app compares before/after noise spectra with a dB delta indicator

The session shows a **completion summary** with all applied changes, noise metrics, and PID response data. You can start a new tuning cycle to iterate further. Past sessions are archived in the **Tuning History** panel on the dashboard.

### 4. Quick Analysis (No Tuning Session)

If you just want to analyze a log without applying changes:

1. Connect FC and download a Blackbox log
2. Click **Analyze** on any downloaded log (without starting a tuning session)
3. Opens a **read-only Analysis Overview** — shows both filter and PID analysis on a single page
4. No Apply buttons — purely informational, great for reviewing flight data

### 5. Managing Snapshots

Snapshots capture the FC's full CLI configuration at a point in time.

- **Baseline** — Auto-created on first connection, cannot be deleted
- **Manual** — Create anytime via "Create Snapshot" button with optional label
- **Auto (safety)** — Created automatically before applying tuning changes
- **Compare** — Click to see GitHub-style diff between snapshots
- **Restore** — Roll back to any snapshot (creates a safety backup first, sends CLI commands, reboots FC)
- **Export** — Download as `.txt` file

### 6. Exporting Configuration

The FC Info panel provides two export options:

- **Export CLI Diff** — Only changed settings (recommended for sharing/backup)
- **Export CLI Dump** — Full configuration dump

### 7. Blackbox Storage Management

The Blackbox Storage panel shows flash usage and downloaded logs:

- **Download** — Downloads all flight data from FC flash to local storage
- **Erase Flash** — Permanently deletes all data from FC flash (required before each test flight)
- **Test Read** — Diagnostic tool to verify FC flash communication
- **Open Folder** — Opens the local log storage directory

During an active tuning session, Blackbox actions are driven by the status banner (single point of action).

## Troubleshooting

### Port Access Issues

**macOS/Linux:**
```bash
sudo chmod 666 /dev/ttyUSB0  # or your port
```

**Windows:**
- Install STM32 VCP drivers
- Check Device Manager for COM port

### Rebuild Native Modules

If serialport doesn't work after installation:
```bash
npm run rebuild
```

### Connection Timeout

- Ensure FC is powered on
- Check USB cable (data cable, not charge-only)
- Try different USB port
- Restart the application

### FC Not Detected

- Verify FC is in MSP mode (not CLI or DFU)
- Check Betaflight Configurator can connect
- Install proper USB drivers

### "FC not responding to MSP commands"

- Caused by reconnecting too quickly after disconnect
- Wait for the 3-second cooldown timer, then retry
- If persistent, physically unplug and replug the USB cable

## MSP Protocol

The app uses the MultiWii Serial Protocol (MSP) v1 to communicate with Betaflight:

- **MSP_API_VERSION** - Get API version
- **MSP_FC_VARIANT** / **MSP_FC_VERSION** - Firmware identification
- **MSP_BOARD_INFO** - Board and target information
- **MSP_UID** - Unique FC serial number (for profile matching)
- **MSP_PID** / **MSP_SET_PID** - Read/write PID configuration
- **MSP_FILTER_CONFIG** - Read current filter settings
- **MSP_PID_ADVANCED** - Read feedforward configuration (boost, gains, smoothing, jitter, transition)
- **MSP_DATAFLASH_SUMMARY** - Flash storage information
- **MSP_DATAFLASH_READ** - Download Blackbox data
- **MSP_DATAFLASH_ERASE** - Erase flash storage
- **CLI Mode** - For configuration export, snapshot restore, and filter tuning

## Configuration Storage

All data is stored locally per platform:

- **macOS**: `~/Library/Application Support/bfautotune/data/`
- **Windows**: `%APPDATA%/bfautotune/data/`
- **Linux**: `~/.config/bfautotune/data/`

Subdirectories:
- `profiles/` — Drone profile JSON files + metadata index
- `snapshots/` — Configuration snapshot JSON files
- `blackbox/` — Downloaded Blackbox log files (`.bbl`)
- `tuning/` — Tuning session state files (per profile)
- `tuning-history/` — Archived tuning records (per profile)

## How Autotuning Works

Betaflight PID AutoTune automates the two core aspects of FPV drone tuning: **filter tuning** (reducing noise) and **PID tuning** (improving flight response). Both use Blackbox log analysis to produce data-driven recommendations.

### Filter Tuning (FFT Analysis)

The filter tuning pipeline analyzes gyro noise to determine optimal lowpass filter cutoff frequencies.

**Pipeline:** `SegmentSelector` → `FFTCompute` → `NoiseAnalyzer` → `FilterRecommender`

1. **Segment selection** — Identifies stable hover segments from throttle and gyro data, excluding takeoff, landing, and aggressive maneuvers
2. **FFT computation** — Applies Welch's method (Hanning window, 50% overlap, 4096-sample windows) to compute power spectral density for each axis
3. **Noise analysis** — Estimates the noise floor (lower quartile), detects prominent peaks (>6 dB above local floor), and classifies noise sources:
   - Frame resonance (80–200 Hz)
   - Motor harmonics (equally-spaced peaks)
   - Electrical noise (>500 Hz)
4. **Filter recommendation** — Maps the measured noise floor (dB) to a target cutoff frequency (Hz) via linear interpolation between safety bounds

#### Filter Safety Bounds

| Filter | Min Cutoff | Max Cutoff (no RPM) | Max Cutoff (with RPM) | Source |
|--------|-----------|--------------------|-----------------------|--------|
| Gyro LPF1 | 75 Hz | 300 Hz | 500 Hz | [BF Tuning Guide](https://www.betaflight.com/docs/wiki/guides/current/PID-Tuning-Guide): 50 Hz = "very noisy", 80 Hz = "slightly noisy"; 75 Hz is a conservative midpoint |
| D-term LPF1 | 70 Hz | 200 Hz | 300 Hz | [BF Filtering Wiki](https://github.com/betaflight/betaflight/wiki/Gyro-&-Dterm-filtering-recommendations): "70–90 Hz range" for D-term |

The **minimum cutoffs** are derived from the official Betaflight guides. The **maximum cutoffs** represent the point where further relaxation provides negligible latency benefit. With RPM filter active, maximums are raised because 36 per-motor notch filters already handle motor noise, so the lowpass can afford to be more relaxed.

#### Noise-Based Targeting (Linear Interpolation)

The cutoff target is computed from the **worst-case noise floor** across roll and pitch axes (dB), mapped linearly to the cutoff range:

```
t = (noiseFloorDb - (-10)) / ((-70) - (-10))
targetHz = minHz + t × (maxHz - minHz)
```

| Noise Floor (dB) | Meaning | Gyro LPF1 Target | D-term LPF1 Target |
|-------------------|---------|-------------------|---------------------|
| **-10 dB** (very noisy) | Extreme vibration/noise | 75 Hz (min) | 70 Hz (min) |
| **-40 dB** (moderate) | Typical mid-range quad | ~188 Hz | ~135 Hz |
| **-70 dB** (very clean) | Pristine signal | 300 Hz (max) | 200 Hz (max) |

The -10 dB and -70 dB anchor points are calibrated from real Blackbox logs across various frame sizes (3"–7"). This is our own interpolation method — not a community standard — designed to produce **convergent** (idempotent) recommendations: same noise data always produces the same target, regardless of current settings.

#### Filter Decision Table

| Rule | Trigger Condition | Action | Confidence | Source / Rationale |
|------|-------------------|--------|------------|---------------------|
| **Noise floor → lowpass** | Overall noise = high or low | Set gyro/D-term LPF1 to noise-based target | High (noisy) / Medium (clean) | Linear interpolation from BF guide bounds (see above) |
| **Dead zone** | \|target − current\| ≤ 5 Hz | No change recommended | — | Prevents micro-adjustments that add no real benefit |
| **Resonance peak → cutoff** | Peak ≥ 12 dB above local floor AND below current cutoff | Lower cutoff to peakFreq − 20 Hz (clamped to bounds) | High | Strong resonance passing through the filter must be blocked |
| **Disabled gyro LPF + resonance** | gyro_lpf1 = 0 (disabled) AND resonance peak detected | Enable gyro LPF1 at peakFreq − 20 Hz | High | Common BF 4.4+ config with RPM filter; re-enable when needed |
| **Dynamic notch range** | Peak below `dyn_notch_min_hz` | Lower dyn_notch_min to peakFreq − 20 Hz (floor: 50 Hz) | Medium | Notch can't track peaks outside its configured range |
| **Dynamic notch range** | Peak above `dyn_notch_max_hz` | Raise dyn_notch_max to peakFreq + 20 Hz (ceiling: 1000 Hz) | Medium | Same as above, upper bound |
| **RPM → notch count** | RPM filter active AND dyn_notch_count > 1 | Reduce dyn_notch_count to 1 | High | Motor noise handled by RPM notches; fewer dynamic notches = less CPU + latency |
| **RPM → notch Q** | RPM filter active AND dyn_notch_q < 500 | Raise dyn_notch_q to 500 | High | Only frame resonances remain; narrower notch = less signal distortion |
| **RPM motor diagnostic** | RPM filter active AND motor harmonics still detected (≥ 12 dB) | Warning: check motor_poles / ESC telemetry | Medium | Motor harmonics should not exist with working RPM filter |
| **Deduplication** | Multiple rules target same setting | Keep more aggressive value, upgrade confidence | — | Ensures a single coherent recommendation per setting |

**RPM filter awareness:** When the RPM filter is active (detected via MSP or BBL headers), the recommender widens safety bounds because motor noise is already handled by the 36 narrow notch filters tracking motor frequencies. It also recommends dynamic notch optimization (count 3→1, Q 300→500) since only frame resonances remain. If motor harmonics are still detected with RPM active, a diagnostic warns about possible `motor_poles` misconfiguration or ESC telemetry issues.

#### Filter Methodology Sources

| Source | What We Use From It |
|--------|---------------------|
| [Betaflight PID Tuning Guide](https://www.betaflight.com/docs/wiki/guides/current/PID-Tuning-Guide) | Gyro LPF1 cutoff range (50–80 Hz for noisy quads), general filtering philosophy |
| [BF Filtering Wiki](https://github.com/betaflight/betaflight/wiki/Gyro-&-Dterm-filtering-recommendations) | D-term LPF1 "70–90 Hz" recommendation, dynamic notch configuration |
| [BF Configurator](https://github.com/betaflight/betaflight-configurator) | RPM-aware max cutoffs (verified against Configurator auto-adjust behavior) |
| [Oscar Liang: PID Filter Tuning](https://oscarliang.com/pid-filter-tuning-blackbox/) | Blackbox-based filter tuning workflow, noise floor interpretation |
| [PIDtoolbox](https://pidtoolbox.com/home) | Spectral analysis methodology, noise floor percentile approach |
| Real Blackbox logs (3"–7" quads) | Calibration of -10 dB / -70 dB noise anchor points |

### PID Tuning (Step Response Analysis)

PID tuning works by detecting sharp stick inputs ("steps") in the Blackbox log and measuring how the drone's gyro (actual rotation) tracks the pilot's command (setpoint).

**Pipeline:** `StepDetector` → `StepMetrics` → `PIDRecommender`

#### Step 1: Detect Step Inputs

A "step" is a rapid, decisive stick movement. The detector scans setpoint data for each axis (roll, pitch, yaw):

1. Compute the setpoint derivative at each sample
2. Flag samples where |derivative| > 500 deg/s/s as potential step edges
3. Group consecutive high-derivative samples into a single edge
4. Validate each candidate:
   - **Minimum magnitude**: step must be ≥ 100 deg/s
   - **Hold time**: setpoint must hold near the new value for ≥ 50 ms (not just a transient spike)
   - **Cooldown**: at least 100 ms gap between consecutive steps (avoids rapid stick reversals)

#### Step 2: Measure Response Metrics

For each valid step, the algorithm extracts a 300 ms response window and computes:

| Metric | Definition | How It's Measured |
|--------|-----------|-------------------|
| **Rise time** | How fast the drone responds | Time from 10% to 90% of final gyro value |
| **Overshoot** | How much gyro exceeds the target | Peak deviation beyond steady-state, as % of step magnitude |
| **Settling time** | How quickly oscillations die out | Last time gyro exits the ±2% band around steady-state |
| **Latency** | Delay before first movement | Time until gyro moves >5% of step magnitude from baseline |
| **Ringing** | Post-step oscillation count | Zero-crossings around steady-state, counted as full cycles |

These metrics follow standard control theory definitions (consistent with MATLAB `stepinfo`).

#### Step 3: Generate PID Recommendations

The recommendation engine applies rule-based tuning logic anchored to the PID values from the Blackbox log header (the PIDs that were active during the flight). This anchoring makes recommendations **convergent** — applying them and re-analyzing the same log produces no further changes.

**Decision Table:**

The thresholds below show the **Balanced** (default) values. These adapt based on the pilot's **flight style preference** (set in the profile):

| Threshold | Smooth | Balanced | Aggressive |
|-----------|--------|----------|------------|
| Overshoot ideal | 3% | 10% | 18% |
| Overshoot max | 12% | 25% | 35% |
| Settling max | 250 ms | 200 ms | 150 ms |
| Ringing max | 1 cycle | 2 cycles | 3 cycles |
| Moderate overshoot | 8% | 15% | 25% |
| Sluggish rise time | 120 ms | 80 ms | 50 ms |

**Decision Table (Balanced thresholds shown):**

| Condition | Action | Step Size | Confidence | Rationale |
|-----------|--------|-----------|------------|-----------|
| Overshoot > 25% (severity 1–2×) | Increase D | +5 | High | D-term dampens bounce-back (Betaflight guide) |
| Overshoot > 25% (severity 2–4×) | Increase D | +10 | High | Proportional step for faster convergence |
| Overshoot > 25% (severity > 4×) | Increase D | +15 | High | Extreme overshoot needs aggressive dampening |
| Overshoot > 25% AND (severity > 2× OR D ≥ 60% of max) | Also decrease P | -5 / -10 | High | D alone insufficient at extreme overshoot |
| Overshoot 15–25% | Increase D | +5 | Medium | Moderate overshoot, D-first strategy |
| Overshoot < 10% AND rise time > 80 ms | Increase P | +5 | Medium | Sluggish response needs more authority (FPVSIM) |
| Ringing > 2 cycles | Increase D | +5 | Medium | Oscillation = underdamped response |
| Settling > 200 ms AND overshoot < 15% | Increase D | +5 | Low | Slow convergence, may have other causes |

*Yaw axis uses relaxed thresholds (1.5x overshoot limit, 1.5x sluggish threshold).*

**Safety Bounds:**

| Parameter | Min | Max |
|-----------|-----|-----|
| P gain | 20 | 120 |
| D gain | 15 | 80 |
| I gain | 30 | 120 |

**Key design decisions:**

- **D-first strategy for overshoot** — Increasing D (dampening) is always the first action. P is only reduced as a supplement when overshoot is extreme (>2× threshold) or D is already near its ceiling (≥60% of max). This is safer for beginners because lowering P too aggressively can make the drone feel unresponsive.
- **Proportional step sizing** — Step sizes scale with overshoot severity: ±5 for mild issues (baseline, consistent with FPVSIM guidance), ±10 for significant overshoot (2–4× threshold), and ±15 for extreme cases (>4× threshold). This reduces the number of tuning flights needed while staying within safety bounds. All changes are clamped to safe min/max ranges (P: 20–120, D: 15–80).
- **Flight-PID anchoring** — Recommendations target values relative to the PIDs recorded in the Blackbox header, not the FC's current values. This prevents recommendation drift when PIDs are changed between flights and log analysis.
- **Feedforward awareness** — The recommender detects whether feedforward is active from BBL headers (`feedforward_boost > 0`). At each step's overshoot peak, it compares `|pidF|` vs `|pidP|` magnitude. When overshoot is FF-dominated (FF contributes more than P), the engine skips P/D changes and instead recommends reducing `feedforward_boost`. This prevents misattributing FF-caused overshoot to P/D imbalance.
- **Flight style adaptation** — PID thresholds adjust based on the user's profile flight style. Smooth (cinematic) pilots get tighter overshoot tolerances and accept slower response. Aggressive (racing) pilots tolerate more overshoot in exchange for maximum snap. The Balanced default matches the standard thresholds. Style is set per-profile and preset profiles include sensible defaults (e.g., 5" Race → Aggressive).

### Interactive Analysis Charts

Analysis results are visualized with interactive SVG charts (Recharts):

- **Spectrum Chart** — FFT noise spectrum per axis (roll/pitch/yaw), with noise floor reference lines and peak frequency markers. Helps users visually understand where noise lives in the frequency domain.
- **Step Response Chart** — Overlaid setpoint vs. gyro traces for individual steps, with prev/next navigation and a metrics overlay (overshoot %, rise time, settling time, latency). Shows exactly how the drone tracked each stick input.
- **Axis Tabs** — Shared roll/pitch/yaw/all tab selector for both chart types.

Charts are integrated directly into the tuning wizard steps (filter analysis and PID analysis) as collapsible sections, open by default.

### Safety & Rollback
- All tuning changes create an automatic safety snapshot before applying
- One-click rollback to any previous configuration via CLI command replay
- Safety bounds prevent extreme PID and filter values
- Plain-English explanations accompany every recommended change

### Tuning Methodology Sources

The autotuning rules and thresholds are based on established FPV community practices:

| Source | Used For |
|--------|----------|
| [Betaflight PID Tuning Guide](https://www.betaflight.com/docs/wiki/guides/current/PID-Tuning-Guide) | P/I/D role definitions, overshoot→D rule, bounce-back diagnostics |
| [FPVSIM Step Response Guide](https://fpvsim.com/how-tos/step-response-pd-balance) | P/D balance via step response graphs, ±5 step size, baseline values |
| [Oscar Liang: PID Filter Tuning](https://oscarliang.com/pid-filter-tuning-blackbox/) | Blackbox-based tuning workflow, PIDToolBox methodology |
| [Plasmatree PID-Analyzer](https://github.com/Plasmatree/PID-Analyzer) | Step response as PID performance metric, deconvolution approach |
| [PIDtoolbox](https://pidtoolbox.com/home) | Overshoot 10–15% as ideal range for multirotors |
| [UAV Tech Tuning Principles](https://theuavtech.com/tuning/) | D-gain as damper, P-gain authority, safety-first approach |
| Standard control theory (rise time, settling, overshoot definitions) | Metric definitions consistent with MATLAB `stepinfo` |

## Known Limitations

- MSP v1 only (v2 support planned)
- Blackbox analysis supports both onboard flash and SD card storage (SD card uses MSC mode for download)
- Requires test flights in a safe environment
- Huffman-compressed Blackbox data not yet supported (rare, BF 4.1+ feature)
- Feedforward: detection and FF-aware PID recommendations implemented; direct FF parameter tuning (writing `feedforward_boost` via MSP) not yet supported

## Development Roadmap

- **Phase 1**: ✅ MSP connection, profiles, snapshots
- **Phase 2**: ✅ Blackbox analysis, automated tuning, rollback
- **Phase 2.5**: ✅ UX polish — profile simplification, interactive analysis charts
- **Phase 3**: ✅ Mode-aware wizard, read-only analysis overview, flight guides
- **Phase 4**: ✅ Stateful two-flight tuning workflow with smart reconnect, verification flight, tuning history
- **Phase 5**: ⬜ Complete manual testing & UX polish (real hardware validation)
- **Phase 6**: ✅ CI/CD & cross-platform releases (macOS/Windows/Linux installers)
- **Phase 7a**: ✅ Playwright E2E tests (demo mode, 16 tests)
- **Phase 7b**: ⬜ E2E tests on real FC in CI pipeline

See [SPEC.md](./SPEC.md) for detailed requirements and phase tracking.

## License

MIT

## Contributing

Contributions welcome! Please open an issue first to discuss changes.
