# TODO - Betaflight Autotuning App

**Last Updated:** February 7, 2026
**Current Status:** Phase 1 - 85% Complete
**Priority:** Complete Tasks #11 and #12 before hardware testing

---

## 🎯 Phase 1 - Remaining Tasks

### Task #11: Implement Reconnection Logic ⏳
**Priority:** HIGH | **Estimate:** 2-3 hours | **Status:** Not Started

#### Requirements:
- [ ] Detect FC disconnection (serial port disconnect event)
- [ ] Automatic reconnection after FC reboot
- [ ] Retry logic with exponential backoff
- [ ] UI feedback during reconnection process
- [ ] Support "save-and-reboot" flow
- [ ] Timeout for reconnection attempts
- [ ] User notifications about connection status

#### Files to Modify:
- `src/main/msp/MSPConnection.ts` - disconnect detection
- `src/main/msp/MSPClient.ts` - retry logic
- `src/main/ipc/handlers.ts` - IPC events for UI
- `src/renderer/hooks/useConnection.ts` - UI state

#### Notes:
- Implement as new `ReconnectionManager` module?
- Use exponential backoff: 1s, 2s, 4s, 8s, 16s (max 5 attempts)
- Add configuration constants to `src/shared/constants.ts`

---

### Task #12: Polish & Testing ⏳
**Priority:** MEDIUM | **Estimate:** 4-6 hours | **Status:** Partial (40%)

#### 12.1 UI Improvements
- [ ] Toast notification system
- [ ] Loading spinners for long operations
- [ ] Progress bar for CLI export
- [ ] Error boundaries in React components
- [ ] Better error messages (user-friendly)
- [ ] Keyboard shortcuts (Cmd+R for refresh, etc.)
- [ ] Accessibility (ARIA labels, focus management)

#### 12.2 Build System
- [ ] Fix Python/distutils issue
  - Option A: Use Python 3.11
  - Option B: Update to `@electron/rebuild`
  - Option C: Use prebuilt binaries
- [ ] Test build process (`npm run build`)
- [ ] Verify app launches after build

#### 12.3 Testing Without Hardware
- [ ] TypeScript compiles without errors
- [ ] Vite dev server runs (`npm run dev`)
- [ ] Electron window opens
- [ ] UI renders correctly
- [ ] IPC communication works
- [ ] Navigation between components
- [ ] Error states display properly

#### 12.4 Testing With Hardware
**Requires:** Connected Betaflight FC via USB

- [ ] Serial port detection works
- [ ] Connection to FC successful
- [ ] FC information loads (version, board, target)
- [ ] CLI diff export works
- [ ] CLI dump export works
- [ ] Baseline snapshot created automatically
- [ ] Manual snapshot creation
- [ ] Snapshot list loads
- [ ] Snapshot deletion works
- [ ] Snapshot export works
- [ ] FC disconnection detected
- [ ] Reconnection after reboot works

#### 12.5 Cross-Platform Testing
- [ ] **macOS** - primary platform (current)
- [ ] **Windows 10/11** - USB driver compatibility
- [ ] **Linux (Ubuntu/Debian)** - serial port permissions

#### 12.6 Bug Fixing
- [ ] Fix all bugs found during testing
- [ ] Edge case handling (multiple FCs, sudden disconnect, etc.)
- [ ] Memory leak check
- [ ] Performance optimization

---

## 📋 Pre-Release Checklist

### Required
- [ ] Task #11 completed (reconnection)
- [ ] Hardware testing complete
- [ ] Build system works on all platforms
- [ ] Basic error handling
- [ ] README updated with test results

### Recommended (nice-to-have)
- [ ] Toast notifications
- [ ] Keyboard shortcuts
- [ ] Unit tests (at least for MSP protocol)
- [ ] User guide with screenshots
- [ ] Video tutorial

---

## 🔄 Current Status - Where We Left Off

**Date:** February 7, 2026

### ✅ Completed:
1. ✅ Electron + Vite + TypeScript + React project
2. ✅ Folder structure
3. ✅ TypeScript configuration
4. ✅ IPC foundation (channels, handlers, preload)
5. ✅ MSP Protocol layer (MSPProtocol, MSPConnection)
6. ✅ MSP Client (high-level API)
7. ✅ Snapshot System (FileStorage, SnapshotManager)
8. ✅ Connection UI components
9. ✅ FC Info UI components
10. ✅ Snapshot Manager UI components

### 🚧 In Progress:
- No tasks currently in progress

### ⏭️ Up Next:
**Task #11: Reconnection logic**
- Start with `ReconnectionManager` module
- Implement disconnect detection in `MSPConnection`
- Add retry logic to `MSPClient`

---

## 📝 Notes and Ideas

### Ideas for Task #11:
```typescript
// Possible ReconnectionManager structure
class ReconnectionManager {
  private maxRetries = 5;
  private baseDelay = 1000; // 1 second

  async attemptReconnection(port: string): Promise<boolean> {
    // Exponential backoff retry logic
  }

  onDisconnected(callback: () => void): void {
    // Event listener
  }
}
```

### Potential Issues:
- Serial port may be locked by another process
- FC may restart during save-and-reboot
- Multiple FCs connected simultaneously
- USB hub compatibility

### Test Scenarios:
1. Normal connect/disconnect
2. FC reboot after "save" command
3. Sudden USB cable removal
4. Multiple connection attempts
5. FC crashed (bootloop)

---

## 🎯 Long-term Goals (Phase 2)

**After Phase 1 completion:**
- [ ] Blackbox log parsing
- [ ] FFT analysis for filter tuning
- [ ] Noise spectrum visualization
- [ ] PID step response analysis
- [ ] Guided tuning wizard
- [ ] AI-powered tuning recommendations

---

## 🐛 Known Bugs

### Critical
- None

### Medium Priority
- Build system requires Python 3.11 or earlier

### Low Priority
- None

---

## 📞 Contact and Resources

- **GitHub Issues:** [create repo]
- **Betaflight MSP Spec:** https://github.com/betaflight/betaflight/wiki/MSP-V1
- **Electron Docs:** https://www.electronjs.org/docs
- **SerialPort Docs:** https://serialport.io/docs/

---

**Note:** Update this file when completing tasks or discovering new issues.
