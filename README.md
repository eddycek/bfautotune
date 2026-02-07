# Beta PIDTune

Phase 1: MSP Connection Module - Desktop application for managing FPV drone PID configurations and autotuning.

## Features

- USB serial connection to flight controllers (Betaflight compatible)
- Read flight controller information (variant, version, board)
- Export CLI configuration (diff and dump)
- Create and manage configuration snapshots
- Automatic baseline snapshot on first connection
- Cross-platform (Windows, macOS, Linux)

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
│   │   ├── storage/
│   │   │   ├── SnapshotManager.ts
│   │   │   └── FileStorage.ts
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
│   │   │   └── SnapshotManager/
│   │   └── hooks/
│   │
│   └── shared/               # Shared types
│       ├── types/
│       └── constants.ts
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

## Known Limitations

- MSP v1 only (v2 support planned)
- No configuration write/restore (Phase 2)
- No blackbox log parsing yet (Phase 2)
- No filter/PID tuning analysis (Phase 2)

## Future Phases

- **Phase 2**: Blackbox log analysis, filter tuning
- **Phase 3**: PID tuning assistant
- **Phase 4**: Cloud API and AI integration

## License

MIT

## Contributing

Contributions welcome! Please open an issue first to discuss changes.
