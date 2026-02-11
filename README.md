# Betaflight PID AutoTune

**Desktop application that takes the guesswork out of FPV drone tuning.**

Most pilots tune their drones by hand — changing PID numbers, test flying, reading Blackbox graphs, and repeating. It's slow, confusing, and error-prone.

BFAutoTune connects to your Betaflight flight controller over USB, guides you through two short test flights, analyzes the Blackbox data automatically (FFT noise analysis for filters, step response metrics for PIDs), and applies optimized settings with one click. No graph reading, no spreadsheets, no guesswork.

**How it works:** Connect FC → Fly hover + throttle sweeps → App tunes filters → Fly stick snaps → App tunes PIDs → Done.

## Current Status

- **Phase 1:** ✅ Complete - MSP connection, profile management, snapshots
- **Phase 2:** ✅ Complete - Blackbox analysis, automated tuning, rollback
- **Phase 2.5:** ✅ Complete - Profile simplification, interactive analysis charts
- **Phase 3:** ✅ Complete - Mode-aware wizard, read-only analysis, flight guides
- **Phase 4:** ✅ Complete - Stateful two-flight tuning workflow

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
- Binary BBL log parser (validated against BF Explorer, 205 tests)
- Multi-session support (multiple flights per file)
- FC diagnostics: debug_mode and logging rate verification with warnings

### Automated Tuning
- **Filter tuning**: FFT noise analysis (Welch's method, Hanning window, peak detection)
- **PID tuning**: Step response analysis (rise time, overshoot, settling, ringing)
- Convergent recommendations (idempotent - rerunning produces same result)
- Safety bounds prevent extreme values, plain-English explanations
- One-click apply with automatic safety snapshot

### Two-Flight Guided Workflow
- Stateful tuning session: filters first (hover + throttle sweeps), then PIDs (stick snaps)
- Step-by-step banner with progress indicator (10 phases)
- Smart reconnect detection: auto-advances when flight data detected
- Post-erase guidance: flash erased notification with flight guide
- Mode-aware wizard adapts UI for filter vs PID analysis

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

## Installation

### Prerequisites

- Node.js 18+ and npm
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

### Testing

All UI changes must include tests. Tests automatically run before commits.

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Open interactive UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

See [TESTING.md](./TESTING.md) for complete testing guidelines and best practices.

## Building

Build the application for your platform:
```bash
npm run build
```

Output will be in the `release/` directory.

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
│   │   ├── blackbox/            # BBL binary log parser (6 modules, 227 tests)
│   │   ├── analysis/            # FFT noise + step response analysis (10 modules)
│   │   │   ├── FFTCompute.ts        # Welch's method, Hanning window
│   │   │   ├── SegmentSelector.ts   # Hover segment detection
│   │   │   ├── NoiseAnalyzer.ts     # Peak detection, noise classification
│   │   │   ├── FilterRecommender.ts # Noise-based filter targets
│   │   │   ├── FilterAnalyzer.ts    # Filter analysis orchestrator
│   │   │   ├── StepDetector.ts      # Step input detection in setpoint
│   │   │   ├── StepMetrics.ts       # Rise time, overshoot, settling
│   │   │   ├── PIDRecommender.ts    # Flight-PID-anchored P/D recommendations
│   │   │   ├── PIDAnalyzer.ts       # PID analysis orchestrator
│   │   │   ├── headerValidation.ts  # BB header diagnostics
│   │   │   └── constants.ts         # Tunable thresholds
│   │   ├── storage/             # Data managers
│   │   │   ├── ProfileManager.ts        # Multi-drone profile CRUD
│   │   │   ├── ProfileStorage.ts        # File-based profile storage
│   │   │   ├── SnapshotManager.ts       # Configuration snapshots
│   │   │   ├── BlackboxManager.ts       # BB log file management
│   │   │   ├── TuningSessionManager.ts  # Tuning session state machine
│   │   │   └── FileStorage.ts           # Generic file storage utilities
│   │   ├── ipc/                 # IPC handlers
│   │   │   ├── handlers.ts     # All IPC request handlers
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
│   │   │   ├── FCInfo/                # FC details + BB diagnostics
│   │   │   ├── BlackboxStatus/        # Flash storage, download, erase
│   │   │   ├── SnapshotManager/       # Snapshot CRUD, diff view, restore
│   │   │   ├── TuningWizard/          # Multi-step guided wizard + charts
│   │   │   │   └── charts/            # SpectrumChart, StepResponseChart, AxisTabs
│   │   │   ├── TuningStatusBanner/    # Workflow progress banner
│   │   │   ├── AnalysisOverview/      # Read-only analysis view
│   │   │   ├── TuningWorkflowModal/   # Two-flight workflow help
│   │   │   ├── Toast/                 # Toast notification system
│   │   │   ├── ProfileWizard.tsx      # New FC profile creation wizard
│   │   │   ├── ProfileSelector.tsx    # Profile switching dropdown
│   │   │   ├── ProfileCard.tsx        # Individual profile display
│   │   │   ├── ProfileEditModal.tsx   # Profile editing dialog
│   │   │   └── ProfileDeleteModal.tsx # Profile deletion confirmation
│   │   ├── hooks/               # React hooks
│   │   │   ├── useConnection.ts       # Connection state management
│   │   │   ├── useProfiles.ts         # Profile CRUD operations
│   │   │   ├── useSnapshots.ts        # Snapshot management
│   │   │   ├── useTuningSession.ts    # Tuning session lifecycle
│   │   │   ├── useTuningWizard.ts     # Wizard state (parse/analyze/apply)
│   │   │   ├── useAnalysisOverview.ts # Read-only analysis state
│   │   │   ├── useBlackboxInfo.ts     # BB flash info
│   │   │   ├── useBlackboxLogs.ts     # BB log list
│   │   │   ├── useFCInfo.ts           # FC info polling
│   │   │   └── useToast.ts            # Toast context consumer
│   │   ├── contexts/            # React contexts
│   │   │   └── ToastContext.tsx
│   │   └── test/                # Test setup
│   │       └── setup.ts         # window.betaflight mock
│   │
│   └── shared/                  # Shared types & constants
│       ├── types/               # TypeScript interfaces (8 type files)
│       └── constants/           # MSP codes, presets, flight guides
│
└── docs/                        # Design docs
    ├── BBL_PARSER_VALIDATION.md   # Parser validation against BF Explorer
    └── TUNING_WORKFLOW_REVISION.md # Phase 4 design doc
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

- **Debug Mode** should be `GYRO_SCALED` for noise analysis (amber warning if set to `NONE`)
- **Logging Rate** should be at least 2 kHz (shown with green checkmark or amber warning)

To change these settings, use Betaflight Configurator:
```
set debug_mode = GYRO_SCALED
set blackbox_sample_rate = 0    # Full rate logging
save
```

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

After both flights, the session shows as **completed**. You can start a new cycle to iterate further.

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

| Filter | Min Cutoff | Max Cutoff | Noise-Based Targeting |
|--------|-----------|-----------|----------------------|
| Gyro LPF1 | 75 Hz | 300 Hz | -10 dB → 75 Hz, -70 dB → 300 Hz |
| D-term LPF1 | 70 Hz | 200 Hz | -10 dB → 70 Hz, -70 dB → 200 Hz |

Changes are only recommended when the difference from the current setting exceeds a 5 Hz dead zone, preventing unnecessary micro-adjustments.

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

| Condition | Action | Step Size | Confidence | Rationale |
|-----------|--------|-----------|------------|-----------|
| Overshoot > 25% | Increase D | +5 | High | D-term dampens bounce-back (Betaflight guide) |
| Overshoot > 25% AND D ≥ 60% of max | Also decrease P | -5 | High | D alone insufficient at high values |
| Overshoot 15–25% | Increase D | +5 | Medium | Moderate overshoot, D-first strategy |
| Overshoot < 10% AND rise time > 80 ms | Increase P | +5 | Medium | Sluggish response needs more authority (FPVSIM) |
| Ringing > 2 cycles | Increase D | +5 | Medium | Oscillation = underdamped response |
| Settling > 200 ms AND overshoot < 15% | Increase D | +5 | Low | Slow convergence, may have other causes |

*Yaw axis uses relaxed thresholds (1.5x overshoot limit, 120 ms sluggish threshold).*

**Safety Bounds:**

| Parameter | Min | Max |
|-----------|-----|-----|
| P gain | 20 | 120 |
| D gain | 15 | 80 |
| I gain | 30 | 120 |

**Key design decisions:**

- **D-first strategy for overshoot** — Increasing D (dampening) is prioritized over decreasing P (reducing authority). This is safer for beginners because lowering P too aggressively can make the drone feel unresponsive and harder to control.
- **Step size of ±5** — Consistent with FPVSIM tuning guidance ("lower P incrementally by ~5 units"). Small incremental changes allow iterative refinement across multiple flights.
- **Flight-PID anchoring** — Recommendations target values relative to the PIDs recorded in the Blackbox header, not the FC's current values. This prevents recommendation drift when PIDs are changed between flights and log analysis.

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
- Blackbox analysis requires onboard flash storage (SD card logging not yet supported)
- Requires test flights in a safe environment
- Huffman-compressed Blackbox data not yet supported (rare, BF 4.1+ feature)

## Development Roadmap

- **Phase 1**: ✅ MSP connection, profiles, snapshots
- **Phase 2**: ✅ Blackbox analysis, automated tuning, rollback
- **Phase 2.5**: ✅ UX polish — profile simplification, interactive analysis charts
- **Phase 3**: ✅ Mode-aware wizard, read-only analysis overview, flight guides
- **Phase 4**: ✅ Stateful two-flight tuning workflow with smart reconnect
- **Phase 5**: ⬜ Complete manual testing & UX polish (real hardware validation)
- **Phase 6**: ⬜ CI/CD & cross-platform releases (macOS/Windows/Linux installers)
- **Phase 7**: ⬜ E2E tests on real FC in CI pipeline

See [SPEC.md](./SPEC.md) for detailed requirements and phase tracking.

## License

MIT

## Contributing

Contributions welcome! Please open an issue first to discuss changes.
