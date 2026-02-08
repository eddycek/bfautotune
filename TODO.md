# TODO - Beta PIDTune

**Last Updated:** February 8, 2026
**Current Status:** Phase 2 - Blackbox Analysis In Progress 🚧 | FFT Analysis Complete ✅
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
**PR #1:** https://github.com/eddycek/beta-pidtune/pull/1 - Ready for Review ✅

Complete multi-drone profile system allowing users to manage multiple drones with:
- Unique identification via FC serial number (MSP_UID)
- 10 preset profiles (tiny-whoop, micro-whoop, 5" freestyle, 7" long range, etc.)
- Custom profile creation with smart defaults (1S-6S batteries, 1"-10" drone sizes)
- Profile-specific snapshot tracking with server-side filtering
- Auto-detection of known/new drones on connection
- Profile locking when FC is connected (prevents accidental switching)
- Comprehensive UI testing (128 tests) with pre-commit hooks
- Full documentation (CLAUDE.md, TESTING.md)

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

### Features Implemented
- ✅ 10 preset profiles (tiny-whoop, micro-whoop, toothpick, freestyle, race, cinematic, long-range, etc.)
- ✅ Battery support: 1S, 2S, 3S, 4S, 6S
- ✅ Drone sizes: 1", 2", 2.5", 3", 4", 5", 6", 7", 10"
- ✅ Smart defaults: changing size auto-fills weight, motor KV, battery, prop size
- ✅ Profile editing: Full edit modal with all fields editable
- ✅ Profile deletion: Confirmation modal with warnings, deletes all associated snapshots
- ✅ Profile locking: Cannot switch profiles when FC is connected (UI lock with visual indicator)
- ✅ Profile-specific snapshots: Server-side filtering by profile.snapshotIds array
- ✅ Auto-detection: Known drones auto-load profile, new drones show wizard (cannot be cancelled)
- ✅ Connection tracking: Last connected timestamp, connection count
- ✅ Baseline snapshots: Auto-created on first connection
- ✅ Board name handling: Null byte filtering, fallback to target name
- ✅ Connection reliability: 3-second cooldown, auto port detection, retry logic

### Bug Fixes (8 Critical Issues Resolved)
- ✅ **Profile deletion blocked**: Removed active profile check, auto-clear currentProfileId
- ✅ **Orphaned snapshots**: Delete all profile snapshots on profile deletion
- ✅ **App crash on preset**: Added missing PRESET_PROFILES import
- ✅ **"FC not responding" on immediate reconnect**: Added 3s cooldown + 1s backend delay
- ✅ **Baseline not auto-created**: Create baseline after profile creation
- ✅ **Port error on FC change**: Auto-detect port changes, select first available
- ✅ **Wrong snapshots visible**: Server-side filtering by currentProfile.snapshotIds
- ✅ **Empty board name**: Filter null bytes, fallback to target, conditional display

### Testing Infrastructure ✅
**Total: 429 tests across 24 test files**

#### Components (77 tests)
- ✅ ConnectionPanel.test.tsx (12 tests)
- ✅ ProfileSelector.test.tsx (11 tests)
- ✅ FCInfoDisplay.test.tsx (12 tests)
- ✅ ProfileEditModal.test.tsx (18 tests)
- ✅ ProfileDeleteModal.test.tsx (14 tests)
- ✅ SnapshotManager.test.tsx (22 tests)

#### Hooks (45 tests)
- ✅ useConnection.test.ts (15 tests)
- ✅ useProfiles.test.ts (14 tests)
- ✅ useSnapshots.test.ts (16 tests)

#### Automation
- ✅ Pre-commit hooks via Husky + lint-staged
- ✅ Tests run automatically on staged file changes
- ✅ Commit blocked if tests fail
- ✅ Test commands: `npm test`, `npm run test:run`, `npm run test:ui`

### Documentation ✅
- ✅ **CLAUDE.md**: Architecture guide (268 lines)
  - Electron process model
  - Multi-drone profile system
  - MSP communication details
  - IPC architecture
  - Storage system
  - Key behaviors & gotchas
  - Common issues & solutions

- ✅ **TESTING.md**: Testing guidelines (405 lines)
  - Test stack overview
  - Running tests
  - Writing tests
  - Common patterns
  - Best practices
  - Coverage goals
  - Troubleshooting

### Manual Testing
- ✅ Backend compiles without errors
- ✅ UI components render correctly
- ✅ ProfileWizard modal displays on new FC
- ✅ Profile creation (preset + custom)
- ✅ Profile editing and deletion
- ✅ Profile switching and locking
- ✅ Snapshot creation, export, deletion
- ✅ Connection/disconnection flow
- ✅ Cooldown mechanism
- ✅ Auto port detection
- ✅ All 8 bug fixes verified

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
- ✅ Task #11 completed (reconnection, cooldown, auto-detection)
- ✅ Multi-drone profile system completed
- ✅ All critical bugs fixed (8 issues resolved)
- ✅ Comprehensive testing (128 tests with pre-commit hooks)
- ✅ Basic error handling
- ✅ Documentation (CLAUDE.md, TESTING.md, README updated)
- [ ] Hardware testing with real FC (manual verification)
- [ ] Build system works on all platforms
- [ ] macOS build tested
- [ ] Windows build tested
- [ ] Linux build tested

### Recommended (nice-to-have)
- [ ] Toast notifications
- [ ] Keyboard shortcuts
- [ ] Loading spinners for long operations
- [ ] Progress bar for CLI export
- [ ] User guide with screenshots
- [ ] Video tutorial

---

## 🔄 Current Status - Where We Left Off

**Date:** February 8, 2026
**Branch:** `feature/fft-analysis`
**PR:** https://github.com/eddycek/beta-pidtune/pull/5

### ✅ Phase 1 Completed (100%):
1. ✅ Electron + Vite + TypeScript + React project
2. ✅ MSP Protocol + Serial connection
3. ✅ FC info display + CLI export
4. ✅ Snapshot versioning system
5. ✅ Multi-drone profile system (auto-detect by FC serial)
6. ✅ Profile management UI (wizard, editing, deletion)
7. ✅ 8 critical bug fixes
8. ✅ 128 UI tests with pre-commit hooks

### 🚧 Phase 2 In Progress:
- ✅ Task #15: Blackbox MSP commands (download, erase, info)
- ✅ Task #16: Blackbox binary log parser (171 tests) — PR #4 merged
- ✅ Task #17: FFT analysis engine (91 tests) — PR #5 pending review
- ⏳ Task #18: Step response analyzer
- ⏳ Task #19: Guided wizard UI
- ⏳ Task #20: Auto-apply recommendations

### ⏭️ Up Next:
- Merge PR #5 (FFT analysis)
- Task #18: Step response analysis for PID tuning
- Task #19: Guided wizard UI for test flights
- Task #20: Auto-apply filter/PID changes to FC

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

## 🎯 Phase 2 - Blackbox Analysis System

**Status:** In Progress 🚧 (3/6 tasks complete)
**Branches:** `feature/auto-pid-tuning`, `feature/blackbox-parser`, `feature/fft-analysis`
**Started:** February 7, 2026

### Overview
Automated FPV drone tuning via Blackbox log analysis. No manual PID editor - fully automated filter and PID tuning based on FFT analysis and step response metrics.

### Task #15: Blackbox MSP Commands ✅
**Priority:** HIGH | **Status:** Completed
**Branch:** `feature/auto-pid-tuning` | **PR:** #2, #3

#### 15.1 Blackbox Capability Detection ✅
- ✅ Implement MSP_DATAFLASH_SUMMARY command
- ✅ Check if onboard flash storage available
- ✅ Detect total capacity and used space
- ✅ Add to MSPClient.ts with types

#### 15.2 Blackbox Download ✅
- ✅ Implement MSP_DATAFLASH_READ command
- ✅ Stream log data from flash storage
- ✅ Progress tracking for large logs
- ✅ Save to local file (.bbl format)
- ✅ Handle download errors/timeouts

#### 15.3 Blackbox Configuration ✅
- ✅ Read current Blackbox settings (rate, debug mode)
- ✅ BlackboxManager storage with profile-linked log metadata
- ✅ IPC channels for download, list, delete, erase flash

### Task #16: Blackbox Parser ✅
**Priority:** HIGH | **Status:** Completed
**Branch:** `feature/blackbox-parser` | **PR:** #4 (merged)
**Tests:** 171 new tests

#### 16.1 Parser Core ✅
- ✅ StreamReader → HeaderParser → ValueDecoder → PredictorApplier → FrameParser → BlackboxParser
- ✅ 10 encoding types (SIGNED_VB, UNSIGNED_VB, TAG8_8SVB, TAG2_3S32, etc.)
- ✅ 10 predictor types (ZERO, PREVIOUS, STRAIGHT_LINE, AVERAGE_2, etc.)
- ✅ I-frame and P-frame decoding with delta decompression
- ✅ Multi-session support (multiple flights per file)
- ✅ Corruption recovery with resync logic

#### 16.2 Data Extraction ✅
- ✅ Time series extraction (gyro, setpoint, PID, motor, debug) as Float64Array
- ✅ Sample rate calculation from header looptime
- ✅ Duration calculation with corruption tolerance
- ✅ Flash header stripping for MSP-downloaded logs

#### 16.3 IPC Integration ✅
- ✅ BLACKBOX_PARSE_LOG IPC channel with progress events
- ✅ Preload bridge: parseBlackboxLog(logId, onProgress)

### Task #17: FFT Analysis Engine ✅
**Priority:** HIGH | **Status:** Completed
**Branch:** `feature/fft-analysis` | **PR:** #5
**Tests:** 91 new tests

#### 17.1 FFT Implementation ✅
- ✅ `fft.js` library (lightweight, no native modules)
- ✅ Welch's method: overlapping windowed FFT → averaged power spectrum
- ✅ Hanning window function
- ✅ Configurable window size (default 4096), 50% overlap
- ✅ Frequency range trimming (20-1000 Hz)

#### 17.2 Noise Analysis ✅
- ✅ Noise floor estimation (lower quartile of magnitudes)
- ✅ Prominence-based peak detection (>6 dB above local floor)
- ✅ Peak classification: frame resonance (80-200 Hz), motor harmonics (spacing detection), electrical (>500 Hz)
- ✅ Noise level categorization (low/medium/high)
- ✅ Multi-segment spectrum averaging for robust estimates

#### 17.3 Filter Recommendations ✅
- ✅ Gyro lowpass cutoff adjustment (raise for low noise, lower for high noise)
- ✅ D-term lowpass cutoff adjustment (more aggressive than gyro)
- ✅ Dynamic notch min/max validation against detected peaks
- ✅ Resonance peak → cutoff lowering when peak below current filter
- ✅ Safety bounds (gyro LPF min 100 Hz, D-term LPF min 80 Hz)
- ✅ Beginner-friendly plain-English explanations
- ✅ Deduplication when multiple rules target same setting

#### 17.4 Pipeline ✅
- ✅ SegmentSelector → FFTCompute → NoiseAnalyzer → FilterRecommender → FilterAnalyzer
- ✅ Async progress reporting (segmenting/fft/analyzing/recommending)
- ✅ Fallback to entire flight when no hover segments found
- ✅ IPC: ANALYSIS_RUN_FILTER + EVENT_ANALYSIS_PROGRESS

### Task #18: Step Response Analyzer
**Priority:** MEDIUM | **Status:** Not Started

#### 18.1 Step Detection
- [ ] Detect step inputs in setpoint data
- [ ] Align gyro response with setpoint
- [ ] Extract rise time, overshoot, settling time
- [ ] Handle noisy data and false positives

#### 18.2 PID Metrics
- [ ] Overshoot percentage calculation
- [ ] Ringing frequency and amplitude
- [ ] Latency (delay to first response)
- [ ] Settling time to within 2%
- [ ] Score function for optimal D value

#### 18.3 P/D Balance & Master Gain
- [ ] D sweep analysis (compare multiple logs)
- [ ] Select best D value via scoring
- [ ] Master gain oscillation detection
- [ ] Stability margin calculation
- [ ] Recommendations with safety margins

### Task #19: Guided Wizard UI
**Priority:** MEDIUM | **Status:** Not Started

#### 19.1 Wizard Flow
- [ ] Setup step (prerequisites, Blackbox config)
- [ ] Filter tuning step (throttle sweep instructions)
- [ ] PID tuning step (D sweep instructions)
- [ ] Results step (summary, apply changes)
- [ ] Progress indicator

#### 19.2 Flight Instructions
- [ ] Clear step-by-step instructions
- [ ] Visual aids (diagrams, animations)
- [ ] Safety checklist
- [ ] Prerequisite validation
- [ ] Video tutorials (optional)

#### 19.3 Results Display
- [ ] Before/after comparison
- [ ] Change explanations (beginner-friendly)
- [ ] Advanced graphs (FFT spectrum, step response)
- [ ] Toggle advanced details
- [ ] Export report (PDF/HTML)

### Task #20: Auto-Apply Changes
**Priority:** HIGH | **Status:** Not Started

#### 20.1 Configuration Write
- [ ] Apply filter changes via MSP
- [ ] Apply PID changes via MSP
- [ ] Verify changes written successfully
- [ ] Handle write errors

#### 20.2 Snapshot Integration
- [ ] Auto-create snapshot before changes
- [ ] Auto-create snapshot after changes
- [ ] Store tuning metadata (filter/PID)
- [ ] Generate CLI diff for review

#### 20.3 Safety & Rollback
- [ ] Validation before apply
- [ ] Bounds checking (no extreme values)
- [ ] One-click rollback to previous snapshot
- [ ] Warning on risky changes

---

## 🎯 Long-term Goals (Phase 3+)

**After Phase 2 completion:**
- [ ] AI-powered tuning recommendations (optional, via API key)
- [ ] Cloud analysis service (Kubernetes deployment)
- [ ] Export session reports (PDF/HTML)
- [ ] Advanced metrics dashboard
- [ ] Fleet management (multiple drones)

---

## 🐛 Known Bugs

### Critical
- ✅ None (all 8 critical bugs fixed in feature/drone-profiles)

### Medium Priority
- Build system requires Python 3.11 or earlier (distutils deprecated in 3.12)

### Low Priority
- None

### Recently Fixed (in PR #1)
- ✅ Profile deletion blocked for active profile
- ✅ Orphaned snapshots after profile deletion
- ✅ App crash when selecting preset without custom name
- ✅ "FC not responding" error on immediate reconnect
- ✅ Baseline snapshot not auto-created
- ✅ Port error when changing FC
- ✅ Wrong snapshots visible (cross-profile contamination)
- ✅ Empty/corrupted board name display

---

## 📞 Contact and Resources

- **GitHub Issues:** [create repo]
- **Betaflight MSP Spec:** https://github.com/betaflight/betaflight/wiki/MSP-V1
- **Electron Docs:** https://www.electronjs.org/docs
- **SerialPort Docs:** https://serialport.io/docs/

---

**Note:** Update this file when completing tasks or discovering new issues.
