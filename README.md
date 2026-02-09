# Beta PIDTune

**Automated FPV Drone Tuning Application for Betaflight**

Desktop application that automatically tunes filter and PID settings by analyzing Blackbox logs. No manual graph reading required - guided test flights, automated analysis, and one-click tuning.

## Current Status

- **Phase 1:** ✅ Complete - MSP connection, profile management, snapshots
- **Phase 2:** ✅ Complete - Blackbox analysis, automated tuning, rollback
- **Phase 2.5:** ✅ Complete - Profile simplification, interactive analysis charts
- **Tests:** 621 across 35 files

## Features

### Phase 1
- ✅ Multi-drone profile management (auto-detection by FC serial)
- ✅ USB serial connection to Betaflight flight controllers
- ✅ Configuration snapshots with versioning and rollback
- ✅ CLI export (diff/dump)
- ✅ Toast notifications for user feedback
- ✅ Cross-platform (Windows, macOS, Linux)

### Phase 2
- ✅ Blackbox log download and parsing (175 tests)
- ✅ Automated filter tuning (FFT noise analysis, 98 tests)
- ✅ Automated PID tuning (step response analysis, 69 tests)
- ✅ Guided tuning wizard with flight instructions
- ✅ One-click apply changes with automatic safety snapshot
- ✅ Snapshot restore/rollback to any previous configuration
- ✅ Convergent recommendations (idempotent — rerunning produces same result)
- ✅ Interactive analysis charts (FFT spectrum + step response visualization)

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
git clone <repository-url>
cd betaflight-tune
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

**📖 See [TESTING.md](./TESTING.md) for complete testing guidelines and best practices.**

## Building

Build the application for your platform:
```bash
npm run build
```

Output will be in the `release/` directory.

## Project Structure

```
betaflight-tune/
├── src/
│   ├── main/                 # Main process (Node.js)
│   │   ├── index.ts          # Entry point
│   │   ├── window.ts         # Window management
│   │   ├── msp/              # MSP communication
│   │   │   ├── MSPClient.ts  # High-level MSP client
│   │   │   ├── MSPConnection.ts # Serial connection
│   │   │   └── MSPProtocol.ts # Protocol encoding/decoding
│   │   ├── blackbox/         # Blackbox log parser
│   │   ├── analysis/         # FFT + step response analysis
│   │   ├── storage/          # Profile, snapshot, blackbox managers
│   │   └── ipc/              # IPC handlers
│   │
│   ├── preload/              # Preload script
│   │   └── index.ts          # Exposed API
│   │
│   ├── renderer/             # Renderer process (React)
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ConnectionPanel/
│   │   │   ├── FCInfo/
│   │   │   ├── SnapshotManager/
│   │   │   ├── TuningWizard/   # Multi-step tuning wizard
│   │   │   └── TuningWorkflowModal/
│   │   └── hooks/
│   │
│   └── shared/               # Shared types & constants
│       ├── types/
│       └── constants/
│
└── data/snapshots/           # Snapshot storage
```

## Usage

### Connecting to Flight Controller

1. Connect your flight controller via USB
2. Click "Scan" to detect available serial ports
3. Select your FC from the dropdown
4. Click "Connect"

The app will automatically:
- Read FC information
- Create a baseline snapshot (if first connection)
- Display FC details

### Exporting Configuration

Once connected, you can export the configuration:

- **Export CLI Diff**: Exports only changed settings (recommended)
- **Export CLI Dump**: Exports full configuration

### Managing Snapshots

**Create Snapshot:**
1. Ensure FC is connected
2. Click "Create Snapshot"
3. Optionally enter a label
4. Click "Create"

**Export Snapshot:**
- Click "Export" on any snapshot to download the configuration

**Delete Snapshot:**
- Click "Delete" on manual snapshots (baseline cannot be deleted)

### Baseline Snapshot

A baseline snapshot is automatically created on first connection. This captures the initial FC configuration and cannot be deleted. It serves as a reference point for future comparisons.

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
- Check USB cable
- Try different USB port
- Restart the application

### FC Not Detected

- Verify FC is in MSP mode (not CLI or DFU)
- Check Betaflight Configurator can connect
- Install proper USB drivers

## MSP Protocol

The app uses the MultiWii Serial Protocol (MSP) v1 to communicate with Betaflight:

- **MSP_API_VERSION** - Get API version
- **MSP_FC_VARIANT** - Get firmware variant
- **MSP_FC_VERSION** - Get firmware version
- **MSP_BOARD_INFO** - Get board information
- **CLI Mode** - For configuration export

## Configuration Storage

Snapshots are stored as JSON files in:
- **macOS**: `~/Library/Application Support/betaflight-tune/data/snapshots/`
- **Windows**: `%APPDATA%/betaflight-tune/data/snapshots/`
- **Linux**: `~/.config/betaflight-tune/data/snapshots/`

## How Autotuning Works

Beta PIDTune automates the two core aspects of FPV drone tuning: **filter tuning** (reducing noise) and **PID tuning** (improving flight response). Both use Blackbox log analysis to produce data-driven recommendations.

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
- Blackbox analysis requires onboard flash storage
- Requires test flights in safe environment
- No AI recommendations in MVP (manual tuning algorithm)

## Development Roadmap

- **Phase 1**: ✅ MSP connection, profiles, snapshots
- **Phase 2**: ✅ Blackbox analysis, automated tuning, rollback
- **Phase 2.5**: ✅ UX polish — profile simplification, interactive analysis charts
- **Phase 3**: 📋 AI recommendations (optional, via user API key)
- **Phase 4**: 📋 Cloud analysis service (Kubernetes deployment)

## License

MIT

## Contributing

Contributions welcome! Please open an issue first to discuss changes.
