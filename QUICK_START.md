# Quick Start Guide

## Prerequisites

1. **Node.js 18+**
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

2. **Python 3.11 or earlier** (for native modules)
   ```bash
   python3 --version  # Should be 3.11.x or earlier
   ```

   If you have Python 3.12+, you'll need to install Python 3.11:
   - macOS: `brew install python@3.11`
   - Windows: Download from python.org
   - Linux: Use your package manager

3. **Build Tools**
   - **macOS**: `xcode-select --install`
   - **Windows**: Visual Studio Build Tools
   - **Linux**: `sudo apt-get install build-essential`

## Installation

### 1. Install Dependencies

```bash
cd betaflight-tune
npm install --ignore-scripts
```

### 2. Rebuild Native Modules

**Option A: Using @electron/rebuild (recommended)**
```bash
npx @electron/rebuild
```

**Option B: Using electron-rebuild**
```bash
npm run rebuild
```

**Option C: Manual rebuild**
```bash
./node_modules/.bin/electron-rebuild -f -w serialport
```

If you get errors about Python distutils:
```bash
# macOS
export PYTHON=/usr/local/bin/python3.11
npm run rebuild

# Windows
set PYTHON=C:\Python311\python.exe
npm run rebuild
```

## Development

### Start Dev Server

```bash
npm run dev
```

This will:
1. Start Vite dev server with hot reload
2. Launch Electron app
3. Open DevTools automatically

The app will reload when you make changes to:
- Main process: Requires app restart
- Renderer process: Hot reload enabled

### Project Structure

```
src/
├── main/       - Main process (Node.js, MSP, storage)
├── preload/    - Preload script (IPC bridge)
├── renderer/   - UI (React components)
└── shared/     - Shared types and constants
```

## Building

### Development Build
```bash
npm run build:main      # Compile main process
npm run build:renderer  # Build renderer
```

### Production Build
```bash
npm run build
```

Output: `release/` directory

## Testing Without Hardware

The app will run without a flight controller connected:
- Port scanning will show empty list (or non-FC ports)
- Connection will fail gracefully
- Snapshots will load from disk

To simulate FC connection, you'll need actual hardware.

## Testing With Hardware

### 1. Connect Flight Controller
- Connect FC via USB
- Ensure it's powered on
- Make sure it's in MSP mode (not CLI or DFU)

### 2. Launch App
```bash
npm run dev
```

### 3. Connect
1. Click "Scan" to detect ports
2. Select your FC from dropdown
3. Click "Connect"

### 4. Test Operations
- View FC information
- Export CLI diff/dump
- Create snapshot
- View/delete snapshots

## Troubleshooting

### "No ports found"
- Check USB connection
- Try different USB port
- Install STM32 VCP drivers (Windows)
- Check permissions: `sudo chmod 666 /dev/ttyUSB0` (Linux)

### "Connection timeout"
- Ensure FC is powered
- Check USB cable
- Verify FC is in MSP mode
- Restart app and try again

### "Module did not self-register"
- Rebuild native modules: `npm run rebuild`
- Check Node.js version matches Electron's

### "Python distutils not found"
- Install Python 3.11 or earlier
- Set PYTHON environment variable
- Rebuild: `npm run rebuild`

### App won't start
- Clear node_modules: `rm -rf node_modules && npm install`
- Check console for errors
- Try: `npm run dev -- --no-sandbox`

## Development Tips

### Enable Debug Logging
In `src/main/utils/logger.ts`:
```typescript
log.transports.console.level = 'debug';
```

### View Logs
- Console output during development
- Log files in:
  - macOS: `~/Library/Logs/betaflight-tune/`
  - Windows: `%USERPROFILE%\AppData\Roaming\betaflight-tune\logs\`
  - Linux: `~/.config/betaflight-tune/logs/`

### Hot Reload Not Working?
- Main process changes require app restart
- Renderer process should hot reload
- Check Vite dev server is running

### DevTools
- Automatically open in dev mode
- Or press: Cmd+Option+I (Mac) / Ctrl+Shift+I (Windows/Linux)

## Common Development Tasks

### Add New IPC Handler
1. Define channel in `src/shared/types/ipc.types.ts`
2. Add handler in `src/main/ipc/handlers.ts`
3. Add method in `src/preload/index.ts`
4. Use in React: `window.betaflight.yourMethod()`

### Add New Component
1. Create in `src/renderer/components/YourComponent/`
2. Export from `YourComponent.tsx`
3. Import in `App.tsx`

### Add New Hook
1. Create in `src/renderer/hooks/useYourHook.ts`
2. Follow existing patterns
3. Return state, loading, error, and actions

## Known Limitations

- MSP v1 only (v2 support planned)
- No configuration restore yet (Phase 2)
- No blackbox log analysis yet (Phase 2)
- macOS tested, Windows/Linux needs testing

## Getting Help

1. Check `IMPLEMENTATION_STATUS.md` for current status
2. Check `README.md` for detailed info
3. Check GitHub issues
4. Enable debug logging and check logs

## Next Steps

After getting the app running:
1. Test all features with real FC
2. Report any bugs
3. Check Phase 2 roadmap
4. Contribute improvements!
