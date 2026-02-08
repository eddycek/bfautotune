# Beta PIDTune

**Automated FPV Drone Tuning Application for Betaflight**

Desktop application that automatically tunes filter and PID settings by analyzing Blackbox logs. No manual graph reading required - guided test flights, automated analysis, and one-click tuning.

## Current Status

- **Phase 1:** ✅ Complete - MSP connection, profile management, snapshots
- **Phase 2:** 🚧 In Progress - Blackbox analysis, automated tuning

## Features

### Phase 1 (Released)
- ✅ Multi-drone profile management (auto-detection by FC serial)
- ✅ USB serial connection to Betaflight flight controllers
- ✅ Configuration snapshots with versioning and rollback
- ✅ CLI export (diff/dump)
- ✅ Toast notifications for user feedback
- ✅ Cross-platform (Windows, macOS, Linux)

### Phase 2 (In Development)
- ✅ Blackbox log download and parsing (171 tests)
- ✅ Automated filter tuning (FFT noise analysis, 91 tests)
- ✅ Automated PID tuning (step response analysis, 58 tests)
- 🚧 Guided tuning wizard with flight instructions
- 🚧 One-click apply changes with rollback

## Tech Stack

- **Electron** - Desktop application framework
- **TypeScript** - Type-safe development
- **React** - UI framework
- **Vite** - Fast build tool
- **serialport** - USB serial communication
- **MSP Protocol** - Betaflight communication protocol

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

## How It Works (Phase 2)

### 1. Filter Tuning
1. Guided throttle-sweep test flight
2. Download Blackbox log from FC
3. FFT analysis detects noise spectrum and resonance peaks
4. Automatically adjusts gyro/D-term lowpass filters
5. Apply changes with one click

### 2. PID Tuning
1. Guided D sweep test flights (multiple flights with varying D)
2. Analyze step responses (overshoot, ringing, latency)
3. Find optimal P/D balance via scoring metrics
4. Master gain tuning (highest stable multiplier)
5. Apply PID changes with automatic snapshot

### 3. Safety & Rollback
- All changes create automatic snapshots
- One-click rollback to any previous configuration
- Safety bounds prevent extreme values
- Plain-English explanations for every change

## Known Limitations

- MSP v1 only (v2 support planned)
- Blackbox analysis requires onboard flash storage
- Requires test flights in safe environment
- No AI recommendations in MVP (manual tuning algorithm)

## Development Roadmap

- **Phase 1**: ✅ MSP connection, profiles, snapshots
- **Phase 2**: 🚧 Blackbox analysis, automated tuning (current)
- **Phase 3**: 📋 AI recommendations (optional, via user API key)
- **Phase 4**: 📋 Cloud analysis service (Kubernetes deployment)

## License

MIT

## Contributing

Contributions welcome! Please open an issue first to discuss changes.
