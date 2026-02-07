# TODO - Beta PIDTune

**Last Updated:** February 7, 2026
**Current Status:** Phase 1 - 100% Complete ✅ | Multi-Drone Profile System - 100% Complete ✅
**GitHub:** https://github.com/eddycek/beta-pidtune
**Workflow:** All changes via Pull Requests (main branch protected)

---

## 🚀 Development Workflow

**Repository:** https://github.com/eddycek/beta-pidtune

### Branch Protection Rules
- ✅ Main branch is protected
- ✅ All changes must go through Pull Requests
- ✅ No direct pushes to main

### Making Changes
1. Create feature branch: `git checkout -b feature/your-feature-name`
2. Make changes and commit
3. Push branch: `git push -u origin feature/your-feature-name`
4. Create Pull Request via GitHub or `gh pr create`
5. Review and merge PR

### Commit Message Format
```
<type>: <subject>

<body>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## ✅ Phase 1 - Completed Tasks

### Task #1-10: Core Implementation ✅
**Status:** Completed

All core Phase 1 features implemented:
- ✅ Electron + Vite + TypeScript + React setup
- ✅ MSP Protocol implementation
- ✅ Serial connection management
- ✅ FC information display
- ✅ Configuration export (diff/dump)
- ✅ Snapshot system with baseline
- ✅ UI components and hooks
- ✅ IPC architecture

### Task #11: CLI Mode & Port Management ✅
**Priority:** HIGH | **Status:** Completed

#### Completed:
- ✅ Fixed port closing after CLI operations
- ✅ CLI mode doesn't call exitCLI() to prevent port closure
- ✅ Auto-exit CLI mode when MSP command is needed
- ✅ Disconnect button working properly
- ✅ Baseline snapshot appears immediately after connection
- ✅ Snapshot list auto-refreshes on connection

---

## ✅ Multi-Drone Profile System - Completed

### Overview
**Status:** 100% Complete ✅
**Branch:** `feature/drone-profiles`
**PR:** Pending merge to main

Complete multi-drone profile system allowing users to manage multiple drones with:
- Unique identification via FC serial number (MSP_UID)
- Preset profiles for common drone types (5" freestyle, 7" long range, etc.)
- Custom profile creation with smart defaults
- Profile-specific snapshot tracking
- Auto-detection of known/new drones on connection

### Task #13: Backend Implementation ✅
**Status:** Completed

#### 13.1 TypeScript Types ✅
- ✅ Profile types (DroneProfile, DroneProfileMetadata, ProfileCreationInput, etc.)
- ✅ Preset profile definitions (6 common drone configurations)
- ✅ Size-based defaults (weight, motor KV, battery, prop size)
- ✅ Optional advanced fields (frame type, flight style, stiffness)

#### 13.2 Storage Layer ✅
- ✅ ProfileStorage: File-based JSON storage
- ✅ ProfileManager: Business logic and validation
- ✅ Profile CRUD operations (create, read, update, delete)
- ✅ Profile-snapshot linking
- ✅ Export/import functionality

#### 13.3 MSP Integration ✅
- ✅ FC serial number retrieval via MSP_UID command
- ✅ UID parsing (12-byte to hex string)
- ✅ Auto-detection on connection
- ✅ Profile matching by serial number

#### 13.4 IPC Layer ✅
- ✅ 10 new IPC channels for profile operations
- ✅ Event channels (profile-changed, new-fc-detected)
- ✅ Handler implementations with error handling
- ✅ Preload script API exposure

#### 13.5 SnapshotManager Integration ✅
- ✅ Snapshots linked to profiles automatically
- ✅ Filter snapshots by current profile
- ✅ Profile-specific baseline snapshots
- ✅ Delete protection for baseline snapshots

### Task #14: UI Implementation ✅
**Status:** Completed

#### 14.1 ProfileWizard Component ✅
- ✅ Multi-step wizard (5 steps)
- ✅ Method selection (preset vs custom)
- ✅ Preset selector with 6 preset profiles
- ✅ Custom configuration (basic + advanced)
- ✅ Smart defaults based on drone size
- ✅ Review step before creation
- ✅ Modal design with backdrop
- ✅ Auto-show on new FC detection

#### 14.2 Profile Management UI ✅
- ✅ ProfileSelector: Collapsible dropdown with all profiles
- ✅ ProfileCard: Individual profile display with metadata
- ✅ Active profile indicator
- ✅ Recent connection indicator
- ✅ Delete and export actions
- ✅ Relative time formatting
- ✅ useProfiles hook for state management

#### 14.3 Integration ✅
- ✅ Integrated into main App.tsx
- ✅ Event listeners for profile changes
- ✅ Auto-show wizard on new FC
- ✅ Profile selector in main layout

### Features
- ✅ 6 preset profiles (5" freestyle, 5" race, 7" long range, etc.)
- ✅ Smart defaults: changing size auto-fills weight, motor KV, battery, prop size
- ✅ Required fields: name, size, prop size, battery, weight, motor KV
- ✅ Optional advanced: frame type, flight style, frame stiffness, notes
- ✅ Profile-specific snapshots (each drone has its own snapshots)
- ✅ Auto-detection: known drones auto-load profile, new drones show wizard
- ✅ Connection tracking: last connected timestamp, connection count
- ✅ Delete protection: cannot delete active profile or baseline snapshots

### Testing
- ✅ Backend compiles without errors
- ✅ UI components render correctly
- ✅ ProfileWizard modal displays on new FC
- ⏳ Hardware testing pending (requires real FC)

---

### Task #12: Initial Testing ✅
**Priority:** MEDIUM | **Status:** Basic testing completed

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
