# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron App                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │                  Renderer Process (React)              │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │     │
│  │  │ Connection   │  │   FC Info    │  │  Snapshot   │  │     │
│  │  │    Panel     │  │   Display    │  │   Manager   │  │     │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │     │
│  │         │                 │                  │         │     │
│  │  ┌──────┴─────────────────┴──────────────────┴──────┐  │     │
│  │  │            Custom React Hooks                    │  │     │
│  │  │  useConnection | useFCInfo | useSnapshots        │  │     │
│  │  └──────────────────────┬───────────────────────────┘  │     │
│  │                         │                              │     │
│  │                  window.betaflight API                 │     │
│  └─────────────────────────┼──────────────────────────────┘     │
│                            │                                     │
│  ┌─────────────────────────┼──────────────────────────────┐     │
│  │               Preload Script (Security)               │     │
│  │         contextBridge.exposeInMainWorld()             │     │
│  └─────────────────────────┼──────────────────────────────┘     │
│                            │ IPC                                │
│                            │                                     │
│  ┌─────────────────────────┼──────────────────────────────┐     │
│  │                  Main Process (Node.js)               │     │
│  │                         │                              │     │
│  │  ┌──────────────────────┴─────────────────────────┐   │     │
│  │  │           IPC Handlers                         │   │     │
│  │  │  connection:* | fc:* | snapshot:*             │   │     │
│  │  └──────┬───────────────────────────┬─────────────┘   │     │
│  │         │                           │                 │     │
│  │  ┌──────┴──────┐         ┌──────────┴─────────┐      │     │
│  │  │  MSPClient  │         │  SnapshotManager   │      │     │
│  │  │             │         │                    │      │     │
│  │  │ - connect() │         │ - create()         │      │     │
│  │  │ - getFCInfo()         │ - load()           │      │     │
│  │  │ - exportCLI()         │ - list()           │      │     │
│  │  └──────┬──────┘         │ - delete()         │      │     │
│  │         │                └──────────┬─────────┘      │     │
│  │  ┌──────┴──────┐                    │                │     │
│  │  │MSPConnection│         ┌──────────┴─────────┐      │     │
│  │  │             │         │   FileStorage      │      │     │
│  │  │ - CLI mode  │         │                    │      │     │
│  │  │ - sendCmd() │         │ - save()           │      │     │
│  │  └──────┬──────┘         │ - load()           │      │     │
│  │         │                │ - list()           │      │     │
│  │  ┌──────┴──────┐         └────────────────────┘      │     │
│  │  │ MSPProtocol │                                     │     │
│  │  │             │                                     │     │
│  │  │ - encode()  │                                     │     │
│  │  │ - decode()  │                                     │     │
│  │  └──────┬──────┘                                     │     │
│  │         │                                            │     │
│  └─────────┼────────────────────────────────────────────┘     │
│            │                                                   │
│  ┌─────────┴───────────────────────────────────────────┐      │
│  │              serialport (Native Module)             │      │
│  │                                                      │      │
│  │         USB Serial Communication Layer              │      │
│  └──────────────────────────┬───────────────────────────┘      │
│                             │                                  │
└─────────────────────────────┼──────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  USB Serial Port  │
                    │                   │
                    │  Flight Controller│
                    │   (Betaflight)    │
                    └───────────────────┘
```

## Data Flow

### 1. Connection Flow

```
User clicks "Connect"
  ↓
ConnectionPanel → useConnection.connect(port)
  ↓
window.betaflight.connect(port)  [Preload API]
  ↓
IPC: connection:connect
  ↓
Main: IPC Handler → MSPClient.connect()
  ↓
MSPConnection.open(port) → serialport.open()
  ↓
MSPClient.getFCInfo() → Multiple MSP commands
  ↓
Event: connection-changed
  ↓
Renderer: onConnectionChanged callback
  ↓
UI updates with FC info
```

### 2. Snapshot Creation Flow

```
User clicks "Create Snapshot"
  ↓
SnapshotManager → useSnapshots.createSnapshot(label)
  ↓
window.betaflight.createSnapshot(label)
  ↓
IPC: snapshot:create
  ↓
Main: SnapshotManager.createSnapshot()
  ↓
MSPClient.exportCLIDiff() → Enter CLI mode → Run "diff all"
  ↓
MSPConnection.sendCLICommand() → serialport.write()
  ↓
Parse CLI output → Create snapshot object
  ↓
FileStorage.saveSnapshot() → Write JSON file
  ↓
Return snapshot to renderer
  ↓
UI updates snapshot list
```

### 3. MSP Message Flow

```
MSPClient.getFCVersion()
  ↓
MSPConnection.sendCommand(MSP_FC_VERSION)
  ↓
MSPProtocol.encode(command, data)
  ↓
Create MSP packet: [$][M][<][size][cmd][data][checksum]
  ↓
serialport.write(buffer)
  ↓
  ... FC processes and responds ...
  ↓
serialport.on('data') → MSPConnection receives buffer
  ↓
MSPProtocol.decode(buffer) → Parse response
  ↓
Resolve promise with response data
  ↓
MSPClient processes and returns version string
```

## Component Hierarchy

```
App
├── ConnectionPanel
│   ├── Port selection dropdown
│   ├── Scan button
│   ├── Connection status
│   └── Connect/Disconnect button
│
├── ProfileSelector (when profiles exist)
│   ├── Profile dropdown
│   ├── Profile cards
│   └── Edit/Delete modals
│
├── FCInfoDisplay (when connected)
│   ├── FC information grid
│   └── Export buttons (diff/dump)
│
├── BlackboxStatus (when connected)
│   ├── Flash storage info
│   ├── Download/Erase buttons
│   └── Tuning Wizard trigger
│
├── SnapshotManager
│   ├── Create snapshot button
│   ├── Create dialog (modal)
│   └── Snapshot list
│       └── SnapshotItem (for each)
│
├── TuningWizard (when triggered)
│   ├── WizardProgress (5-step indicator)
│   ├── TestFlightGuideStep
│   │   └── FlightGuideContent
│   ├── SessionSelectStep
│   ├── FilterAnalysisStep
│   ├── PIDAnalysisStep
│   └── TuningSummaryStep
│
├── TuningWorkflowModal (help modal)
│   ├── Workflow steps
│   └── FlightGuideContent
│
└── ProfileWizard (modal, on new FC)
    └── Multi-step wizard
```

## State Management

### Connection State
```typescript
// In useConnection hook
{
  ports: PortInfo[],           // Available serial ports
  status: ConnectionStatus,    // Current connection state
  loading: boolean,            // Operation in progress
  error: string | null         // Last error message
}
```

### FC Info State
```typescript
// In useFCInfo hook
{
  fcInfo: FCInfo | null,       // Flight controller information
  loading: boolean,
  error: string | null
}
```

### Snapshot State
```typescript
// In useSnapshots hook
{
  snapshots: SnapshotMetadata[],  // List of snapshots
  loading: boolean,
  error: string | null
}
```

## IPC Communication

### Request-Response Pattern
```typescript
// Renderer → Main
const response = await ipcRenderer.invoke(channel, ...args);
if (!response.success) throw new Error(response.error);
return response.data;

// Main handler
ipcMain.handle(channel, async (event, ...args) => {
  try {
    const data = await operation(args);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

### Event Pattern
```typescript
// Main → Renderer
window.webContents.send(event, data);

// Renderer listens
ipcRenderer.on(event, (_, data) => callback(data));
```

## MSP Protocol Structure

### MSP v1 Message Format
```
┌──────┬──────┬─────┬──────┬─────┬──────────┬──────────┐
│  $   │  M   │  <  │ SIZE │ CMD │   DATA   │ CHECKSUM │
├──────┼──────┼─────┼──────┼─────┼──────────┼──────────┤
│ 0x24 │ 0x4D │ 0x3C│ uint8│uint8│ SIZE bytes│  uint8   │
└──────┴──────┴─────┴──────┴─────┴──────────┴──────────┘

Checksum = SIZE ^ CMD ^ DATA[0] ^ DATA[1] ^ ... ^ DATA[SIZE-1]
```

### Response Format
```
┌──────┬──────┬─────┬──────┬─────┬──────────┬──────────┐
│  $   │  M   │  >  │ SIZE │ CMD │   DATA   │ CHECKSUM │
├──────┼──────┼─────┼──────┼─────┼──────────┼──────────┤
│ 0x24 │ 0x4D │ 0x3E│ uint8│uint8│ SIZE bytes│  uint8   │
└──────┴──────┴─────┴──────┴─────┴──────────┴──────────┘
```

### Error Response
```
┌──────┬──────┬─────┬──────┬─────┬──────────┬──────────┐
│  $   │  M   │  !  │ SIZE │ CMD │   DATA   │ CHECKSUM │
├──────┼──────┼─────┼──────┼─────┼──────────┼──────────┤
│ 0x24 │ 0x4D │ 0x21│ uint8│uint8│ SIZE bytes│  uint8   │
└──────┴──────┴─────┴──────┴─────┴──────────┴──────────┘
```

## File System Structure

### Application Data
```
~/Library/Application Support/betaflight-tune/  (macOS)
%APPDATA%/betaflight-tune/                      (Windows)
~/.config/betaflight-tune/                      (Linux)
│
├── data/
│   └── snapshots/
│       ├── {uuid-1}.json  (Baseline)
│       ├── {uuid-2}.json  (Manual backup)
│       └── {uuid-3}.json  (Auto backup)
│
└── logs/
    └── main.log
```

### Snapshot File Format
```json
{
  "id": "uuid",
  "timestamp": "2026-02-02T15:30:00.000Z",
  "label": "Baseline",
  "type": "baseline",
  "fcInfo": {
    "variant": "BTFL",
    "version": "4.5.0",
    "target": "MATEKF722",
    "boardName": "MATEKF722",
    "apiVersion": { "protocol": 1, "major": 45, "minor": 0 }
  },
  "configuration": {
    "cliDiff": "# diff all\nset gyro_lpf1_static_hz = 0\n..."
  },
  "metadata": {
    "appVersion": "0.1.0",
    "createdBy": "user"
  }
}
```

## Security Model

### Process Isolation
- **Main Process**: Full Node.js access, hardware access
- **Renderer Process**: Sandboxed, no Node.js access
- **Preload Script**: Bridge with contextBridge (secure)

### IPC Security
```typescript
// ✅ Good: Preload exposes specific API
contextBridge.exposeInMainWorld('betaflight', {
  connect: (port: string) => ipcRenderer.invoke('connect', port)
});

// ❌ Bad: Exposing entire ipcRenderer
window.ipcRenderer = ipcRenderer;  // Never do this!
```

### No Remote Code Execution
- All IPC handlers validate input
- File paths are sanitized
- No eval() or dynamic code execution
- SerialPort access only through main process

## Error Handling Strategy

### Error Propagation
```
Hardware Error (FC)
  ↓
MSPConnection throws ConnectionError
  ↓
MSPClient catches, logs, re-throws
  ↓
IPC handler catches, returns { success: false, error }
  ↓
Preload API throws Error
  ↓
React hook catches, sets error state
  ↓
UI displays error message to user
```

### Error Types
- `ConnectionError`: Serial port issues
- `MSPError`: Protocol issues
- `TimeoutError`: Operation timed out
- `SnapshotError`: File system issues

## Performance Considerations

### Efficient IPC
- Single IPC call for multiple operations
- Batch snapshot metadata loading
- Lazy loading of full snapshots

### Memory Management
- Buffer pooling for MSP messages
- Stream-based CLI output processing
- Cleanup on disconnect

### UI Responsiveness
- Loading states for async operations
- Debounced port scanning
- Virtual scrolling for large snapshot lists (future)

## Extension Points

### Adding New MSP Commands
1. Define command in `commands.ts`
2. Add method in `MSPClient.ts`
3. Add IPC handler in `handlers.ts`
4. Expose in `preload/index.ts`
5. Use in React components

### Adding New Snapshot Types
1. Update type in `common.types.ts`
2. Add creation logic in `SnapshotManager.ts`
3. Update UI in `SnapshotManager.tsx`

### Adding New UI Panels
1. Create component in `renderer/components/`
2. Create hook if needed in `renderer/hooks/`
3. Import in `App.tsx`

## Testing Strategy

### Unit Tests (522 tests across 31 files)
- MSP protocol encoding/decoding
- Blackbox parser pipeline (171 tests)
- FFT analysis pipeline (91 tests)
- Step response analysis pipeline (58 tests)
- UI components and hooks
- Tuning wizard flow

### Integration Tests
- MSP client with mock serial port
- Snapshot manager with temp directory
- IPC communication

### E2E Tests
- Full connection flow
- Snapshot creation flow
- Error scenarios

## Deployment

### Build Process
```
npm run build
  ↓
tsc (compile TypeScript)
  ↓
vite build (bundle renderer)
  ↓
electron-builder (package app)
  ↓
Output: release/Betaflight-Tune-{version}.{dmg|exe|AppImage}
```

### Platform Specifics
- **macOS**: Code signing required for distribution
- **Windows**: Installer with driver prompts
- **Linux**: AppImage (portable) or .deb package

---

This architecture provides:
- ✅ Clean separation of concerns
- ✅ Type safety across boundaries
- ✅ Scalable for future features
- ✅ Testable components
- ✅ Secure IPC communication
- ✅ Cross-platform compatibility
