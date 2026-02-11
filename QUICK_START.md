# Quick Start Guide

## Prerequisites

1. **Node.js 18+**
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

2. **Python 3** (for native module compilation)
   ```bash
   python3 --version
   ```

3. **Build Tools**
   - **macOS**: `xcode-select --install`
   - **Windows**: Visual Studio Build Tools
   - **Linux**: `sudo apt-get install build-essential`

## Installation

```bash
git clone https://github.com/eddycek/bfautotune.git
cd bfautotune
npm install
npm run rebuild   # Rebuild native modules (serialport) for Electron
```

If `npm run rebuild` fails with Python errors, set the Python path explicitly:
```bash
# macOS / Linux
export PYTHON=$(which python3)
npm run rebuild

# Windows
set PYTHON=C:\Python3\python.exe
npm run rebuild
```

## Development

```bash
npm run dev       # Start dev server + Electron with hot reload
npm test          # Run tests in watch mode
npm run test:run  # Run tests once (same as pre-commit hook)
npm run build     # Production build → release/ directory
```

## Project Structure

```
src/
├── main/        # Main process (Node.js): MSP, storage, analysis
├── preload/     # Preload script: window.betaflight API bridge
├── renderer/    # Renderer process: React UI
└── shared/      # Shared types and constants
```

All main ↔ renderer communication goes through `window.betaflight` API defined in `src/preload/index.ts`.

## Testing Without Hardware

The app runs without a flight controller connected:
- Port scanning shows empty list
- Connection fails gracefully with error message
- You can develop and test all UI components

## Testing With Hardware

1. Connect FC via USB (ensure it's powered and in MSP mode)
2. Run `npm run dev`
3. Click **Scan** → select port → **Connect**
4. On first connection with a new FC, the Profile Wizard opens automatically

## Common Development Tasks

### Add New IPC Handler
1. Define channel in `src/shared/types/ipc.types.ts`
2. Add handler in `src/main/ipc/handlers.ts`
3. Add method in `src/preload/index.ts`
4. Use in React: `window.betaflight.yourMethod()`

### Add New Component
1. Create in `src/renderer/components/YourComponent/`
2. Add test file: `YourComponent.test.tsx`
3. Import in `App.tsx`

### Add New Hook
1. Create in `src/renderer/hooks/useYourHook.ts`
2. Add test file: `useYourHook.test.ts`
3. Follow existing patterns (return state, loading, error, actions)

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No ports found" | Check USB connection, install drivers (STM32 VCP on Windows) |
| "Connection timeout" | Ensure FC is powered, check cable, verify MSP mode |
| "Module did not self-register" | Run `npm run rebuild` |
| App won't start | `rm -rf node_modules && npm install && npm run rebuild` |
| "FC not responding" | Wait for 3s cooldown after disconnect, or replug USB |

### Debug Logging

Logs are in:
- **macOS**: `~/Library/Logs/bfautotune/`
- **Windows**: `%USERPROFILE%\AppData\Roaming\bfautotune\logs\`
- **Linux**: `~/.config/bfautotune/logs/`

DevTools open automatically in dev mode, or press Cmd+Option+I / Ctrl+Shift+I.

## Further Reading

- [CLAUDE.md](./CLAUDE.md) — Full architecture documentation
- [TESTING.md](./TESTING.md) — Testing guidelines and test inventory
- [SPEC.md](./SPEC.md) — Project specification and phase tracking
