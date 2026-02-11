# Comprehensive Testing Plan — BFAutoTune

> **Goal**: 100% functional coverage. Every feature testable without manual intervention. Claude can work on tasks independently without human QA.

> **Date**: 2026-02-11 | **Current state**: 998 tests / 55 files | **Target**: ~1800+ tests / ~85 files

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Coverage Audit](#2-current-coverage-audit)
3. [Testing Pyramid Strategy](#3-testing-pyramid-strategy)
4. [Lessons from Betaflight Configurator](#4-lessons-from-betaflight-configurator)
5. [Phase 1 — MSP Protocol & Connection Layer](#5-phase-1--msp-protocol--connection-layer)
6. [Phase 2 — Storage Layer (Managers)](#6-phase-2--storage-layer-managers)
7. [Phase 3 — IPC Handler Integration Tests](#7-phase-3--ipc-handler-integration-tests)
8. [Phase 4 — BBL Parser Hardening](#8-phase-4--bbl-parser-hardening)
9. [Phase 5 — Analysis Pipeline Validation](#9-phase-5--analysis-pipeline-validation)
10. [Phase 6 — Remaining UI Components](#10-phase-6--remaining-ui-components)
11. [Phase 7 — Remaining Hooks](#11-phase-7--remaining-hooks)
12. [Phase 8 — End-to-End Workflow Tests](#12-phase-8--end-to-end-workflow-tests)
13. [Phase 9 — Infrastructure & Tooling](#13-phase-9--infrastructure--tooling)
14. [Implementation Roadmap](#14-implementation-roadmap)
15. [Test Infrastructure Requirements](#15-test-infrastructure-requirements)
16. [Appendix — File-Level Gap Analysis](#16-appendix--file-level-gap-analysis)

---

## 1. Executive Summary

### What We Have (Strengths)
- **Excellent BBL parser tests** — byte-exact validation against BF Explorer, all 10 encodings + 10 predictors
- **Strong analysis engine** — FFT, step response, filter/PID recommender all well-tested with synthetic data
- **Good UI component coverage** — 21/28 components tested, standardized mock patterns
- **Solid hook testing** — 6/10 hooks tested with event subscription patterns
- **Real-flight regression tests** — integration tests with actual `.bbl` files

### What's Missing (Critical Gaps)

| Gap | Risk | Estimated Tests |
|-----|------|-----------------|
| **IPC handlers** (40+ handlers, 0 tests) | Every user action untested at orchestration level | 200–250 |
| **MSP protocol layer** (encode/decode/connection) | FC communication correctness unverified | 80–120 |
| **Storage managers** (Profile, Snapshot, Blackbox, File) | Data loss/corruption risk | 60–80 |
| **End-to-end workflows** (connect → tune → apply) | Multi-step orchestration untested | 40–60 |
| **Remaining UI components** (7 untested) | Visual regressions, UX bugs | 40–60 |
| **Remaining hooks** (4 untested) | State management bugs | 30–40 |
| **BBL parser stress/fuzz** | Crash on corrupt real-world logs | 20–30 |
| **Analysis with real flight data** | Recommendation quality on real logs | 20–30 |

**Total new tests needed: ~500–670**

---

## 2. Current Coverage Audit

### By Area

| Area | Files Tested / Total | Tests | Coverage |
|------|---------------------|-------|----------|
| Analysis (filter + PID) | 11/11 | 287 | **100%** |
| Blackbox parser | 8/9 | 291 | **89%** |
| UI components | 21/28 | 339 | **75%** |
| Hooks | 6/10 | 103 | **60%** |
| Shared/utils | 4/13 | 45 | **31%** |
| Storage managers | 1/6 | 15 | **17%** |
| MSP layer | 1/5 | 16 | **20%** |
| IPC handlers | 0/2 | 0 | **0%** |
| Main process init | 0/2 | 0 | **0%** |
| Preload | 0/1 | 0 | **0%** |

### Untested Source Files (42 total)

**Critical** (data flow, FC communication):
- `src/main/ipc/handlers.ts` — 1397 lines, 40+ handlers
- `src/main/msp/MSPConnection.ts` — serial port, CLI mode, buffer management
- `src/main/msp/MSPProtocol.ts` — packet encode/decode, CRC
- `src/main/storage/ProfileManager.ts` — profile CRUD, serial uniqueness
- `src/main/storage/SnapshotManager.ts` — snapshot lifecycle, baseline auto-create
- `src/main/storage/BlackboxManager.ts` — log storage, download metadata
- `src/main/index.ts` — startup sequence, smart reconnect

**Medium priority** (UI completeness):
- `src/renderer/components/TuningWizard/FilterAnalysisStep.tsx`
- `src/renderer/components/TuningWizard/SessionSelectStep.tsx`
- `src/renderer/components/TuningWizard/TuningSummaryStep.tsx`
- `src/renderer/components/TuningWizard/ApplyConfirmationModal.tsx`
- `src/renderer/components/TuningWizard/RecommendationCard.tsx`
- `src/renderer/components/TuningWizard/WizardProgress.tsx`
- `src/renderer/hooks/useBlackboxInfo.ts`
- `src/renderer/hooks/useBlackboxLogs.ts`
- `src/renderer/hooks/useFCInfo.ts`
- `src/renderer/hooks/useToast.ts`

**Lower priority** (infrastructure):
- `src/main/storage/FileStorage.ts`, `ProfileStorage.ts`
- `src/main/utils/errors.ts`, `logger.ts`
- `src/main/msp/commands.ts`, `types.ts`
- `src/main/window.ts`, `src/preload/index.ts`

---

## 3. Testing Pyramid Strategy

```
                    ┌─────────┐
                    │  E2E    │  ~40 tests
                    │ Workflow │  Full connect→tune→apply
                    ├─────────┤
                 ┌──┤  IPC    ├──┐  ~200 tests
                 │  │ Integr. │  │  Handler + manager orchestration
                 ├──┴─────────┴──┤
              ┌──┤   Unit Tests  ├──┐  ~400 tests (new)
              │  │ MSP, Storage, │  │  + ~1000 existing
              │  │ UI, Hooks     │  │
              └──┴───────────────┴──┘
```

### Layer Definitions

**Unit tests** — Test single module in isolation. Mock all dependencies.
- MSP protocol encode/decode (pure functions)
- Storage managers (mock filesystem)
- UI components (mock `window.betaflight`)
- Hooks (mock IPC)

**Integration tests** — Test module collaboration. Real dependencies, mocked boundaries.
- IPC handlers with real managers, mocked MSP/serial
- Analysis pipeline with real BBL data
- Storage managers with real temp filesystem

**E2E workflow tests** — Test full user scenarios. Mocked serial port only.
- Connect → detect FC → create profile → fly → download → analyze → apply → verify
- Complete tuning two-flight cycle (filters + PIDs)
- Error recovery: disconnect mid-download, corrupt log, FC reboot

---

## 4. Lessons from Betaflight Configurator

### What They Do

1. **MSP encode/decode tests** — Pure function testing of `encode_message_v1`/`v2` with manual binary buffer construction. Uses `crypto.getRandomValues()` for fuzz-like coverage of all 65536 MSP code combinations.

2. **MSP data processing tests** — Build raw `DataView` buffers with push8/push16/push32 helpers, feed to `process_data()`. Tests byte-level parsing without transport mocking.

3. **FC state reset** — `FC.resetState()` in `beforeEach()` prevents test pollution.

4. **Runtime stress toolkit** — MSP debug suite with 9 scenarios: queue flooding (110 requests), rapid fire (20 @ 10ms), timeout recovery, memory leak detection, connection disruption.

5. **VirtualFC mode** — Populates full FC state for UI development (not used in CI).

6. **SITL** — Firmware compiles as native executable with TCP MSP. Could be used for integration testing but isn't currently automated.

### What They Don't Do (and we should)

1. **No transport-level mocking** — Only test encoding, not request/response cycle. We need mock SerialPort.
2. **No integration tests** — No connect→read→parse→display pipeline tests. We'll add IPC integration tests.
3. **No E2E** — No browser automation. We'll add workflow-level tests with mocked serial.
4. **Very few tests overall** — Only 3 test files vs our 55. We're already ahead.

### Patterns We'll Adopt

1. **MSP response factories** — Typed helpers to build valid binary MSP responses for each command code
2. **Property-based testing** — Random values for MSP encoding round-trip and BBL encoding
3. **Binary buffer helpers** — `push8`, `push16LE`, `push32LE`, `pushString` for building mock MSP responses
4. **FC state factory** — Reusable mock FC states for different firmware versions (4.3, 4.5, 2025.12)

---

## 5. Phase 1 — MSP Protocol & Connection Layer

### 5.1 MSPProtocol Tests (~30 tests)

**File**: `src/main/msp/MSPProtocol.test.ts`

Test the pure encode/decode functions without any serial port dependency.

```
Encoding:
├── encode() standard MSPv1 frame (preamble, size, command, data, checksum)
├── encode() jumbo frame for payloads > 255 bytes
├── encode() empty payload (data.length === 0)
├── encode() max payload size boundary
├── encode() throws MSPError on oversized payload
├── Round-trip: encode → decode produces same command + data
├── Fuzz: random command codes (0-255) with random payloads
│
Decoding:
├── decode() parses valid MSPv1 response frame
├── decode() handles direction byte (FC → host: '>')
├── decode() validates checksum — reject corrupted packets
├── decode() partial buffer — returns null, accumulates
├── decode() multiple messages in single buffer
├── decode() jumbo frame response
├── decode() error response frame (direction byte '!')
└── decode() handles zero-length response
```

**Key pattern**: Build raw buffers byte-by-byte (like BF Configurator), verify encode output matches expected bytes.

### 5.2 MSPConnection Tests (~50 tests)

**File**: `src/main/msp/MSPConnection.test.ts`

Mock `serialport` module. Test state machine, buffer management, CLI mode.

```
Connection lifecycle:
├── open() creates SerialPort with correct params (path, baudRate, 8N1)
├── open() throws ConnectionError if port already open
├── open() emits 'connected' event on success
├── close() resolves immediately if port not open
├── close() sends 'exit' before closing if fcEnteredCLI === true
├── close() does NOT send 'exit' if fcEnteredCLI === false
├── close() clears all pending response timeouts
│
MSP message exchange:
├── send() writes encoded buffer to serial port
├── send() queues response promise with timeout
├── receive() matches response to pending request by command code
├── receive() handles partial responses (buffer accumulation)
├── receive() handles multiple responses in single data event
├── timeout() rejects pending request after N ms
├── timeout() cleans up response queue entry
│
CLI mode:
├── enterCLI() sends '#' and waits for CLI prompt
├── enterCLI() sets cliMode = true and fcEnteredCLI = true
├── enterCLI() is safe to call when already in CLI mode
├── sendCLICommand() sends command and waits for '\n#' prompt
├── sendCLICommand() does NOT false-match '#' in diff output
├── sendCLICommand() accumulates multi-line response
├── exitCLI() resets cliMode flag only (no command sent to FC)
├── forceExitCLI() resets cliMode flag only (no command sent to FC)
├── clearFCRebootedFromCLI() clears fcEnteredCLI flag
│
Error handling:
├── Port disconnect event emits 'disconnected'
├── Port error event emits 'error'
├── Write to closed port throws ConnectionError
└── Concurrent send() calls are serialized (no interleaving)
```

**Mock strategy**: Use `vi.mock('serialport')` with a `MockSerialPort` class that:
- Captures written bytes for assertion
- Allows injecting data events (simulating FC responses)
- Simulates open/close lifecycle

### 5.3 MSPClient Extended Tests (~40 tests)

**File**: `src/main/msp/MSPClient.test.ts` (extend existing)

Currently only tests `extractFlashPayload()`. Add tests for all MSP commands.

```
Connection management:
├── connect() opens port, stabilizes (500ms), reads FC info
├── connect() validates firmware version (BF >= 4.3, API >= 1.44)
├── connect() rejects BF 4.2 with UnsupportedVersionError
├── connect() auto-disconnects on unsupported version
├── connect() retry logic: 2 attempts with reset between failures
├── disconnect() calls connection.close() with 1s backend delay
├── listPorts() filters by Betaflight vendor IDs
├── listPorts() falls back to all ports if no BF vendors found
│
FC info & config:
├── getFCInfo() decodes MSP_FC_VARIANT + MSP_FC_VERSION + MSP_BOARD_INFO
├── getFCSerialNumber() decodes MSP_UID response (3x uint32)
├── getPIDConfiguration() decodes MSP_PID response (9 bytes: 3 axes × 3 terms)
├── setPIDConfiguration() encodes and sends MSP_SET_PID
├── getFilterConfiguration() decodes MSP_FILTER_CONFIG (47 bytes)
├── getFeedforwardConfiguration() decodes FF config
├── getPidProcessDenom() decodes MSP_PID_ADVANCED
│
Blackbox operations:
├── getBlackboxInfo() decodes MSP_DATAFLASH_SUMMARY
├── downloadBlackboxLog() reads flash in chunks with progress callback
├── downloadBlackboxLog() handles compression flag format
├── eraseBlackboxFlash() sends MSP_DATAFLASH_ERASE, polls until usedSize===0
├── eraseBlackboxFlash() handles FCs that don't ACK erase
├── testBlackboxRead() reads first 512 bytes for validation
│
CLI operations:
├── exportCLIDiff() enters CLI, sends 'diff all', captures output
├── saveAndReboot() sends 'save' via CLI, clears fcEnteredCLI
└── saveAndReboot() handles FC not responding after reboot
```

**Mock strategy**: Mock `MSPConnection` class. Provide pre-built binary responses via MSP response factory functions.

### 5.4 MSP Response Factory (`src/main/msp/test/mspResponseFactory.ts`)

Reusable helper for all MSP tests:

```typescript
// Factory functions that build valid MSP binary responses
export function buildFCVariantResponse(variant: string): Buffer;         // MSP 2
export function buildFCVersionResponse(major: number, minor: number, patch: number): Buffer;  // MSP 3
export function buildBoardInfoResponse(boardId: string, hwRevision: number, targetName: string): Buffer;  // MSP 4
export function buildUIDResponse(uid: [number, number, number]): Buffer; // MSP 160
export function buildPIDResponse(pids: PIDConfiguration): Buffer;        // MSP 112
export function buildFilterConfigResponse(filters: CurrentFilterSettings): Buffer;  // MSP 92
export function buildDataflashSummaryResponse(info: BlackboxInfo): Buffer;  // MSP 70
export function buildAPIVersionResponse(major: number, minor: number): Buffer;  // MSP 1

// Preset FC states for common test scenarios
export const FC_STATE = {
  BF_4_3: { variant: 'BTFL', version: '4.3.0', api: '1.44', ... },
  BF_4_5: { variant: 'BTFL', version: '4.5.1', api: '1.46', ... },
  BF_2025_12: { variant: 'BTFL', version: '4.6.0', api: '1.47', ... },
};

// Binary buffer helpers (similar to BF Configurator pattern)
export function push8(buffer: number[], value: number): void;
export function push16LE(buffer: number[], value: number): void;
export function push32LE(buffer: number[], value: number): void;
export function pushString(buffer: number[], str: string, prefixLength?: boolean): void;
```

---

## 6. Phase 2 — Storage Layer (Managers)

### 6.1 FileStorage Tests (~15 tests)

**File**: `src/main/storage/FileStorage.test.ts`

Uses real temp directories (`os.tmpdir()`), not mocks.

```
├── ensureDirectory() creates directory if not exists
├── ensureDirectory() is idempotent (no error if exists)
├── writeJSON() writes valid JSON file
├── readJSON() reads and parses JSON file
├── readJSON() returns null for non-existent file
├── readJSON() throws on corrupted JSON (not silently swallows)
├── deleteFile() removes file
├── deleteFile() no error if file doesn't exist
├── listFiles() returns files matching glob pattern
├── listFiles() returns empty array for empty directory
├── Concurrent writes to same file — last write wins (no corruption)
├── Permission error handling (read-only directory)
└── Path traversal prevention (../../../etc)
```

### 6.2 ProfileStorage Tests (~15 tests)

**File**: `src/main/storage/ProfileStorage.test.ts`

```
├── saveProfile() persists profile JSON to disk
├── loadProfile() reads profile from disk
├── loadProfile() returns null for non-existent profile
├── deleteProfile() removes profile file and updates metadata index
├── listProfiles() returns metadata from index file
├── updateMetadataIndex() keeps index in sync with profile files
├── saveCurrentProfileId() persists to current-profile.txt
├── loadCurrentProfileId() reads from current-profile.txt
├── loadCurrentProfileId() returns null if file doesn't exist
├── Corrupted profile JSON — graceful error with context
├── Corrupted metadata index — rebuilds from profile files
├── Concurrent save + load — no partial reads
└── Profile ID uniqueness enforcement
```

### 6.3 ProfileManager Tests (~25 tests)

**File**: `src/main/storage/ProfileManager.test.ts`

Mock `ProfileStorage`.

```
├── createProfile() generates UUID, sets timestamps
├── createProfile() stores profile in storage
├── createProfile() initializes empty snapshotIds array
├── createProfileFromPreset() maps preset fields correctly
├── updateProfile() merges updates, bumps updatedAt
├── updateProfile() preserves unmodified fields
├── updateProfile() rejects unknown profile ID
├── deleteProfile() removes profile from storage
├── deleteProfile() is idempotent (no error if already deleted)
├── getProfile() returns full profile by ID
├── getProfile() returns null for unknown ID
├── listProfiles() returns all profile metadata
├── setCurrentProfile() updates current-profile.txt
├── setCurrentProfile() validates profile exists
├── getCurrentProfile() returns current profile data
├── getCurrentProfile() returns null if no current profile
├── getCurrentProfileId() returns just the ID string
├── getProfileBySerial() finds profile by FC serial number
├── getProfileBySerial() returns null if no match
├── incrementConnectionCount() bumps counter and lastConnected
├── addSnapshotId() appends to snapshotIds array
├── removeSnapshotId() removes from snapshotIds array
├── exportProfile() writes profile data to external file
└── initialize() calls storage.ensureDirectory()
```

### 6.4 SnapshotManager Tests (~25 tests)

**File**: `src/main/storage/SnapshotManager.test.ts`

Mock `FileStorage` and `MSPClient`.

```
├── createSnapshot() captures CLI diff from MSP client
├── createSnapshot() stores snapshot with label, type, timestamp
├── createSnapshot() links snapshot ID to current profile
├── createSnapshot(label, 'baseline') sets type correctly
├── createSnapshot(label, 'auto') sets type correctly
├── createBaselineIfMissing() creates baseline if profile has none
├── createBaselineIfMissing() skips if baseline already exists
├── loadSnapshot() returns full snapshot data
├── loadSnapshot() returns null for unknown ID
├── deleteSnapshot() removes snapshot file
├── deleteSnapshot() does NOT allow deleting baseline type
├── listSnapshots() returns all snapshot metadata
├── exportSnapshot() writes CLI diff to external .txt file
│
Edge cases:
├── createSnapshot() when MSP client disconnected — throws
├── createSnapshot() with empty CLI diff — stores empty string
├── Concurrent createSnapshot() calls — serialized, no interleaving
├── Corrupted snapshot JSON — graceful error
├── Snapshot with missing cliDiff field — default to empty string
└── Profile with orphaned snapshotIds — listSnapshots filters gracefully
```

### 6.5 BlackboxManager Tests (~20 tests)

**File**: `src/main/storage/BlackboxManager.test.ts`

```
├── saveLog() writes buffer to file with metadata
├── saveLog() generates unique filename and ID
├── saveLog() associates log with profile ID
├── getLog() returns log metadata by ID
├── getLog() returns null for unknown ID
├── listLogs(profileId) returns only logs for given profile
├── listLogs() returns empty array for unknown profile
├── deleteLog() removes log file and metadata
├── deleteLogsForProfile() removes all logs for a profile
├── Log file with correct .bbl extension
├── Large log file handling (> 10MB)
├── Concurrent saveLog() calls — unique filenames
└── File permission errors — descriptive error message
```

---

## 7. Phase 3 — IPC Handler Integration Tests

This is the **highest-impact** gap. Every user action flows through IPC handlers.

### 7.1 Test Architecture

**File**: `src/main/ipc/handlers.test.ts`

**Strategy**: Integration tests with real managers (using temp directories) but mocked MSP client and Electron IPC.

```typescript
// Mock Electron IPC
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: vi.fn(),
  app: { getPath: () => tempDir },
  shell: { openPath: vi.fn() },
}));

// Real managers with temp storage
const tempDir = path.join(os.tmpdir(), 'bfautotune-test-' + uuid());
const profileManager = new ProfileManager(tempDir);
const snapshotManager = new SnapshotManager(tempDir, mockMSPClient);
const blackboxManager = new BlackboxManager(tempDir);
const tuningSessionManager = new TuningSessionManager(tempDir);

// Helper to invoke IPC handler directly
function invokeHandler(channel: string, ...args: any[]): Promise<IPCResponse<any>> {
  // Find registered handler for channel, call it with mock event
}
```

### 7.2 Connection Handlers (~10 tests)

```
├── CONNECTION_LIST_PORTS → calls mspClient.listPorts()
├── CONNECTION_LIST_PORTS → returns error if client not initialized
├── CONNECTION_CONNECT → calls mspClient.connect(portPath)
├── CONNECTION_CONNECT → returns error message on failure
├── CONNECTION_DISCONNECT → calls mspClient.disconnect()
├── CONNECTION_GET_STATUS → returns current connection status
├── FC_GET_INFO → returns FC info object
├── FC_EXPORT_CLI → 'diff' format calls exportCLIDiff()
├── FC_EXPORT_CLI → 'dump' format calls exportCLIDump()
└── FC_GET_FC_SERIAL → returns serial number string
```

### 7.3 Profile Handlers (~15 tests)

```
├── PROFILE_CREATE → creates profile with correct fields
├── PROFILE_CREATE → auto-creates baseline snapshot
├── PROFILE_CREATE → sends profileChanged event to renderer
├── PROFILE_CREATE_FROM_PRESET → maps preset fields correctly
├── PROFILE_CREATE_FROM_PRESET → reads FC serial and info from MSP
├── PROFILE_UPDATE → updates profile fields
├── PROFILE_DELETE → deletes profile + all snapshots + all BB logs
├── PROFILE_DELETE → disconnects if deleting active profile
├── PROFILE_DELETE → sends profileChanged(null) for active profile
├── PROFILE_LIST → returns all profile metadata
├── PROFILE_GET → returns single profile by ID
├── PROFILE_GET_CURRENT → returns currently active profile
├── PROFILE_SET_CURRENT → switches active profile
├── PROFILE_EXPORT → writes profile to external file
└── PROFILE_GET_FC_SERIAL → returns FC serial number
```

### 7.4 Snapshot Handlers (~12 tests)

```
├── SNAPSHOT_CREATE → creates snapshot with label
├── SNAPSHOT_LIST → returns only current profile's snapshots (server-side filtering)
├── SNAPSHOT_LIST → returns empty array when no profile selected
├── SNAPSHOT_DELETE → removes snapshot
├── SNAPSHOT_LOAD → returns full snapshot data
├── SNAPSHOT_EXPORT → writes CLI diff to file
├── SNAPSHOT_RESTORE → applies CLI commands to FC via CLI
├── SNAPSHOT_RESTORE → creates pre-restore backup if requested
├── SNAPSHOT_RESTORE → filters out non-restorable commands (diff, save, board_name, etc.)
├── SNAPSHOT_RESTORE → reports progress via EVENT_SNAPSHOT_RESTORE_PROGRESS
├── SNAPSHOT_RESTORE → saves and reboots FC after applying
└── SNAPSHOT_RESTORE → rejects snapshot with no restorable commands
```

### 7.5 Blackbox Handlers (~15 tests)

```
├── BLACKBOX_GET_INFO → returns flash info from MSP
├── BLACKBOX_DOWNLOAD_LOG → downloads log data, saves with metadata
├── BLACKBOX_DOWNLOAD_LOG → reports progress via EVENT_BLACKBOX_DOWNLOAD_PROGRESS
├── BLACKBOX_DOWNLOAD_LOG → rejects concurrent downloads
├── BLACKBOX_DOWNLOAD_LOG → requires active profile
├── BLACKBOX_LIST_LOGS → returns only current profile's logs
├── BLACKBOX_LIST_LOGS → returns empty array when no profile
├── BLACKBOX_DELETE_LOG → removes log file and metadata
├── BLACKBOX_ERASE_FLASH → calls mspClient.eraseBlackboxFlash()
├── BLACKBOX_TEST_READ → returns test read result
├── BLACKBOX_PARSE_LOG → reads file, parses with BlackboxParser
├── BLACKBOX_PARSE_LOG → reports parse progress via event
├── BLACKBOX_PARSE_LOG → returns error for non-existent log ID
├── BLACKBOX_OPEN_FOLDER → opens containing directory in file manager
└── All handlers → return IPCResponse with error on failure
```

### 7.6 Blackbox Settings Handlers (~10 tests)

```
├── FC_GET_BLACKBOX_SETTINGS → parses debug_mode from baseline diff
├── FC_GET_BLACKBOX_SETTINGS → parses blackbox_sample_rate from baseline diff
├── FC_GET_BLACKBOX_SETTINGS → reads pid_process_denom from MSP when connected
├── FC_GET_BLACKBOX_SETTINGS → falls back to CLI diff for pid_process_denom
├── FC_GET_BLACKBOX_SETTINGS → defaults: debug_mode=NONE, sample_rate=1
├── FC_GET_BLACKBOX_SETTINGS → calculates loggingRateHz correctly
├── FC_FIX_BLACKBOX_SETTINGS → enters CLI, sends commands, saves and reboots
├── FC_FIX_BLACKBOX_SETTINGS → sets pendingSettingsSnapshot flag
├── FC_FIX_BLACKBOX_SETTINGS → rejects empty command list
└── consumePendingSettingsSnapshot() → returns true once, then false
```

### 7.7 Analysis Handlers (~15 tests)

```
├── ANALYSIS_RUN_FILTER → parses log, runs filter analysis, returns result
├── ANALYSIS_RUN_FILTER → auto-reads filter settings from FC if not provided
├── ANALYSIS_RUN_FILTER → reports progress via EVENT_ANALYSIS_PROGRESS
├── ANALYSIS_RUN_FILTER → validates session index range
├── ANALYSIS_RUN_FILTER → enriches settings from BBL headers
├── ANALYSIS_RUN_FILTER → attaches header validation warnings
├── ANALYSIS_RUN_PID → parses log, runs PID analysis, returns result
├── ANALYSIS_RUN_PID → auto-reads PID settings from FC if not provided
├── ANALYSIS_RUN_PID → extracts flightPIDs from BBL header
├── ANALYSIS_RUN_PID → reads flightStyle from current profile
├── ANALYSIS_RUN_PID → attaches header validation warnings
│
PID config handlers:
├── PID_GET_CONFIG → reads current PIDs from FC
├── PID_UPDATE_CONFIG → validates 0-255 range, sends to FC
├── PID_UPDATE_CONFIG → sends pidChanged event to renderer
└── PID_SAVE_CONFIG → calls saveAndReboot()
```

### 7.8 Tuning Workflow Handlers (~20 tests)

```
Apply recommendations:
├── TUNING_APPLY_RECOMMENDATIONS → Stage 1: applies PID via MSP
├── TUNING_APPLY_RECOMMENDATIONS → Stage 2: creates pre-tuning snapshot
├── TUNING_APPLY_RECOMMENDATIONS → Stage 3: applies filter via CLI set commands
├── TUNING_APPLY_RECOMMENDATIONS → Stage 4: saves and reboots
├── TUNING_APPLY_RECOMMENDATIONS → correct staging order (MSP before CLI)
├── TUNING_APPLY_RECOMMENDATIONS → reports progress per stage
├── TUNING_APPLY_RECOMMENDATIONS → validates PID values (clamp 0-255)
├── TUNING_APPLY_RECOMMENDATIONS → handles filter-only (no PIDs)
├── TUNING_APPLY_RECOMMENDATIONS → handles PID-only (no filters)
├── TUNING_APPLY_RECOMMENDATIONS → rejects empty recommendations
│
Session management:
├── TUNING_GET_SESSION → returns session for current profile
├── TUNING_GET_SESSION → returns null when no profile
├── TUNING_START_SESSION → creates session, creates backup snapshot
├── TUNING_START_SESSION → sends EVENT_TUNING_SESSION_CHANGED
├── TUNING_UPDATE_PHASE → updates phase with optional data
├── TUNING_UPDATE_PHASE → sends EVENT_TUNING_SESSION_CHANGED
├── TUNING_RESET_SESSION → deletes session for current profile
├── TUNING_RESET_SESSION → sends EVENT_TUNING_SESSION_CHANGED(null)
│
Feedforward:
├── FC_GET_FEEDFORWARD_CONFIG → returns FF config from MSP
└── FC_GET_FEEDFORWARD_CONFIG → requires FC connected
```

### 7.9 Shared Test Helpers (`src/main/ipc/test/helpers.ts`)

```typescript
// Mock MSP client with all methods stubbed
export function createMockMSPClient(overrides?: Partial<MSPClient>): MockMSPClient;

// Mock IPC event with sender.send() capture
export function createMockEvent(): { event: IpcMainInvokeEvent; sentEvents: Array<{channel: string; data: any}> };

// Helper to register handlers, invoke them, and return response
export class IPCTestHarness {
  registerHandlers(): void;
  invoke<T>(channel: IPCChannel, ...args: any[]): Promise<IPCResponse<T>>;
  getSentEvents(): Array<{channel: string; data: any}>;
}
```

---

## 8. Phase 4 — BBL Parser Hardening

### 8.1 Real-Flight Reference Tests (~15 tests)

**File**: `src/main/blackbox/BlackboxParser.realdata.test.ts`

Add curated `.bbl` files covering edge cases found in the wild:

```
├── BF 4.3.x log (minimum supported version)
├── BF 4.5.x log with DEBUG_GYRO_SCALED
├── BF 2025.12.x log (no DEBUG_GYRO_SCALED)
├── Multi-session log (3+ flights per file)
├── Log with corrupt frames in middle (test recovery)
├── Very short log (< 100 frames) — edge case for analysis
├── Log with all event types (SYNC_BEEP, DISARM, FLIGHT_MODE, LOGGING_RESUME, INFLIGHT_ADJUSTMENT)
├── Log with LOG_END event at exact file boundary
├── Log with unknown bytes between frames
├── 10MB+ log — performance test (must parse in < 5s)
├── Log with NEG_14BIT heavy fields (debug values)
├── Log with TAG8_8SVB count==1 special case
├── Log from different FC targets (STM32F4, STM32F7, STM32H7)
├── Log with high PID loop rate (8kHz no denom)
└── Log with custom blackbox_sample_rate values
```

**Strategy**: Commit small reference `.bbl` files to `src/main/blackbox/fixtures/`. For large files, use a separate CI artifact or download on-demand.

### 8.2 Property-Based / Fuzz Tests (~15 tests)

**File**: `src/main/blackbox/BlackboxParser.fuzz.test.ts`

```
├── Random byte injection — parser doesn't crash (catches all exceptions)
├── Truncated file at every byte position in header — graceful error
├── Truncated file at every byte position in frame — returns partial data
├── Valid header + random payload bytes — recovers to next valid frame
├── All 10 encoding types with random values — encode/decode round-trip
├── All 10 predictor types with random previous values — deterministic
├── Header with extreme field counts (0 fields, 100 fields)
├── Frame with maximum structural size (256 bytes)
├── Iteration jumps > 5000 — detected as corrupt
├── Time jumps > 10 seconds — detected as corrupt
├── LOG_END with invalid string — not mistaken for end
├── Interleaved I/P frames in wrong order — handled
├── File with only headers, no data frames — returns empty session
├── All zero bytes — doesn't hang (finite parsing)
└── Huge iteration values (uint32 max) — no overflow
```

---

## 9. Phase 5 — Analysis Pipeline Validation

### 9.1 End-to-End Analysis with Real Data (~20 tests)

**File**: `src/main/analysis/FilterAnalyzer.realdata.test.ts` and `PIDAnalyzer.realdata.test.ts`

Parse real `.bbl` files and verify the full analysis pipeline produces sensible results:

```
Filter analysis with real data:
├── BF 4.5.x hover log → noise detected, recommendations generated
├── Noise levels are within sane ranges (not NaN, not negative)
├── Peak frequencies are in expected range (50-4000 Hz)
├── Recommended filter cutoffs are within safety bounds
├── All three axes produce results
├── Progress callback fires at expected intervals
├── SegmentSelector finds hover segments in real flight
├── Noise floor estimation is reasonable (< peak amplitudes)
├── RPM filter awareness — detects from BBL headers
├── Analysis completes within 10 seconds for 5-minute log
│
PID analysis with real data:
├── BF 4.5.x acrobatic log → steps detected
├── Step count is non-zero for log with stick movements
├── Overshoot values are in percentage range (0-200%)
├── Rise time values are positive and < 500ms
├── Settling time values are positive and < 2000ms
├── Recommended P/D values are within safety bounds (P: 20-120, D: 15-80)
├── Flight PIDs extracted from BBL header match expected
├── StepDetector finds steps in setpoint data
├── Step response traces have matching time alignment
└── Analysis completes within 10 seconds for 5-minute log
```

### 9.2 Regression Test Suite

When a bug is found in analysis output, add a pinned regression test:

```typescript
it('regression: filter recommender does not produce NaN for flat noise', () => {
  const result = analyzeFilters(flatNoiseData, 0, defaultSettings);
  for (const rec of result.recommendations) {
    expect(rec.recommendedValue).not.toBeNaN();
    expect(rec.recommendedValue).toBeGreaterThan(0);
  }
});
```

---

## 10. Phase 6 — Remaining UI Components

### 10.1 WizardProgress Tests (~10 tests)

**File**: `src/renderer/components/TuningWizard/WizardProgress.test.tsx`

```
├── Renders correct number of steps for filter mode
├── Renders correct number of steps for pid mode
├── Current step highlighted with active style
├── Completed steps show done indicator
├── Upcoming steps show upcoming style
├── Step labels match mode-specific names
├── Click on completed step navigates back
├── Click on upcoming step does nothing
├── Responsive layout (mobile vs desktop)
└── Accessibility: steps have aria-current for active
```

### 10.2 FilterAnalysisStep Tests (~10 tests)

**File**: `src/renderer/components/TuningWizard/FilterAnalysisStep.test.tsx`

```
├── Shows progress indicator during analysis
├── Shows progress percentage text
├── Renders SpectrumChart when analysis complete
├── Renders axis summary with noise levels
├── Renders per-axis recommendation cards
├── Collapsible noise details section
├── Shows warning banner for header validation issues
├── Shows "No noise detected" for clean data
├── Loading state while waiting for results
└── Error state when analysis fails
```

### 10.3 SessionSelectStep Tests (~8 tests)

**File**: `src/renderer/components/TuningWizard/SessionSelectStep.test.tsx`

```
├── Renders session list when multiple sessions available
├── Each session shows flight number and frame count
├── Clicking session calls onSelect callback
├── Auto-selects only session in single-session log
├── Shows message when no sessions available
├── Selected session has visual highlight
├── Session metadata (duration, frame count) displayed
└── Handles zero-session parse result gracefully
```

### 10.4 TuningSummaryStep Tests (~8 tests)

**File**: `src/renderer/components/TuningWizard/TuningSummaryStep.test.tsx`

```
├── Shows "Apply Filters" button in filter mode
├── Shows "Apply PIDs" button in pid mode
├── Displays recommendation count summary
├── Apply button calls onApply callback
├── Apply button disabled during loading
├── Shows success message after apply
├── Displays reboot warning
├── Shows snapshot creation option checkbox
```

### 10.5 ApplyConfirmationModal Tests (~8 tests)

**File**: `src/renderer/components/TuningWizard/ApplyConfirmationModal.test.tsx`

```
├── Modal renders with correct title
├── Shows reboot warning text
├── Snapshot checkbox checked by default
├── Snapshot checkbox can be unchecked
├── Confirm button calls onConfirm with snapshot option
├── Cancel button calls onCancel
├── Shows recommendation count in confirmation text
├── Modal not rendered when isOpen=false
```

### 10.6 RecommendationCard Tests (~8 tests)

**File**: `src/renderer/components/TuningWizard/RecommendationCard.test.tsx`

```
├── Renders setting name and description
├── Shows current value and recommended value
├── Displays change direction (increase/decrease/no change)
├── Color coding for change magnitude
├── Shows explanation text
├── Observation mode (no current/recommended, just text)
├── Multiple recommendations render in list
└── Empty recommendation list shows "no changes" message
```

### 10.7 AxisTabs Tests (~5 tests)

**File**: `src/renderer/components/TuningWizard/charts/AxisTabs.test.tsx`

```
├── Renders Roll, Pitch, Yaw, All tabs
├── Active tab has selected styling
├── Clicking tab calls onSelect with axis value
├── Default selection is "All"
└── Accessibility: tabs have correct role and aria-selected
```

### 10.8 Other Minor Components (~10 tests)

```
App.tsx (5 tests):
├── Renders without crashing
├── Shows ConnectionPanel on initial load
├── Shows ProfileWizard when EVENT_NEW_FC_DETECTED fires
├── Integrates ToastContext provider
└── Integrates all main components

PresetSelector.tsx (3 tests):
├── Renders preset list
├── Clicking preset calls onSelect
└── Selected preset has visual indicator

ProfileCard.tsx (2 tests):
├── Renders profile info (name, size, battery)
└── Shows FC connection indicator
```

---

## 11. Phase 7 — Remaining Hooks

### 11.1 useBlackboxInfo Tests (~10 tests)

**File**: `src/renderer/hooks/useBlackboxInfo.test.ts`

```
├── Fetches BB info on mount when connected
├── Returns flash size, used size, hasLogs
├── Refreshes on manual refresh() call
├── Clears info on disconnect
├── Handles error from getBlackboxInfo API
├── Does not fetch when disconnected
├── Updates on connection change event
├── Returns loading state during fetch
├── Handles concurrent refresh calls gracefully
└── Correctly computes percentage used
```

### 11.2 useBlackboxLogs Tests (~10 tests)

**File**: `src/renderer/hooks/useBlackboxLogs.test.ts`

```
├── Fetches log list on mount when profile active
├── Returns log metadata array
├── Refreshes on profile change event
├── Clears logs on profile deselect
├── deleteLog() removes from list and calls API
├── Handles empty log list
├── Loading state during fetch
├── Error state when API fails
├── Refreshes after download event
└── Sorts logs by timestamp (newest first)
```

### 11.3 useFCInfo Tests (~8 tests)

**File**: `src/renderer/hooks/useFCInfo.test.ts`

```
├── Fetches FC info on mount when connected
├── Returns FCInfo object (variant, version, board, target)
├── Clears info on disconnect
├── Handles getFCInfo API error
├── Does not fetch when disconnected
├── Updates on connection change event
├── Returns null while loading
└── Handles board name empty → fallback to target
```

### 11.4 useToast Tests (~5 tests)

**File**: `src/renderer/hooks/useToast.test.ts`

```
├── Returns showToast function from context
├── showToast adds toast to list
├── Toast auto-dismisses after timeout
├── Multiple toasts stack correctly
└── Throws if used outside ToastProvider
```

---

## 12. Phase 8 — End-to-End Workflow Tests

These are the capstone tests that verify entire user scenarios from start to finish. They use **real managers with temp storage**, **mocked MSP client**, and **mocked Electron IPC**.

### 12.1 Test Architecture

**File**: `src/test/e2e/` directory

```typescript
// E2E test harness
class E2ETestHarness {
  profileManager: ProfileManager;
  snapshotManager: SnapshotManager;
  blackboxManager: BlackboxManager;
  tuningSessionManager: TuningSessionManager;
  mockMSP: MockMSPClient;
  ipc: IPCTestHarness;

  constructor() {
    // Real managers with temp directory
    // Mocked MSP with configurable responses
    // IPC harness that connects everything
  }

  // Simulate FC connection
  async connectFC(fcState: FCState): Promise<void>;
  // Simulate FC disconnect
  async disconnectFC(): Promise<void>;
  // Simulate log download with test .bbl data
  async downloadLog(bblData: Buffer): Promise<string>;
  // Get sent IPC events for assertion
  getSentEvents(): IPCEvent[];
}
```

### 12.2 Connection & Profile Workflows (~10 tests)

**File**: `src/test/e2e/connection.e2e.test.ts`

```
├── New FC → connect → detect new serial → ProfileWizard triggered
├── Known FC → connect → auto-select profile → baseline created if missing
├── Connect → disconnect → 3s cooldown → reconnect succeeds
├── Connect with BF 4.2 → UnsupportedVersionError → auto-disconnect
├── Connect → switch profile manually → rejected (locked while connected)
├── Delete active profile → auto-disconnect → profileChanged(null)
├── Export profile → download file → import on new machine (future)
└── Multiple FCs: connect FC1 → create profile → disconnect → connect FC2 → different profile
```

### 12.3 Snapshot Workflows (~8 tests)

**File**: `src/test/e2e/snapshot.e2e.test.ts`

```
├── Connect → create manual snapshot → appears in list
├── Connect → create snapshot → restore snapshot → settings applied to FC
├── Restore creates "Pre-restore (auto)" backup before applying
├── Snapshot filtering: profile A snapshots not visible in profile B
├── Baseline snapshot auto-created on first connection
├── Snapshot compare shows diff between two snapshots
├── Export snapshot → generates .txt file with CLI diff
└── Snapshot with complex CLI diff (set, feature, serial, aux commands)
```

### 12.4 Filter Tuning Workflow (~10 tests)

**File**: `src/test/e2e/filterTuning.e2e.test.ts`

Full two-flight filter tuning cycle:

```
├── Start tuning session → phase: filter_flight_pending
├── Erase flash → phase still filter_flight_pending, banner shows flight guide
├── Fly + reconnect with flash data → auto-transition to filter_log_ready
├── Download log → parse succeeds → phase: filter_analysis
├── Run filter analysis → recommendations generated
├── Apply filter recommendations → CLI commands sent to FC, FC reboots
├── After reboot → phase: filter_applied → transitions to pid_flight_pending
├── Pre-flight BB settings check → warning shown if settings bad
├── Fix BB settings → FC reboots → clean snapshot on reconnect
└── Cancel tuning mid-flow → session reset, no partial state left
```

### 12.5 PID Tuning Workflow (~10 tests)

**File**: `src/test/e2e/pidTuning.e2e.test.ts`

PID phase of two-flight tuning cycle:

```
├── From pid_flight_pending → erase flash → fly → reconnect → pid_log_ready
├── Download log → parse → pid_analysis
├── Run PID analysis → step response metrics computed
├── Apply PID recommendations → MSP_SET_PID sent before CLI
├── After reboot → pid_applied → transitions to verification_pending
├── Complete tuning → session marked completed
├── Apply with both PID + filter changes → correct staging order
├── PID values clamped to 0-255 range
├── Analysis with no steps detected → warning, no recommendations
└── Flight style affects recommendation thresholds
```

### 12.6 Analysis Without Tuning Session (~5 tests)

**File**: `src/test/e2e/analysis.e2e.test.ts`

Standalone analysis (AnalysisOverview mode):

```
├── Download log → click Analyze → opens AnalysisOverview
├── Single-session log → auto-runs both filter and PID analysis
├── Multi-session log → shows session picker first
├── Analysis results are read-only (no Apply button)
└── Analysis completes successfully for real BF 4.5 log
```

### 12.7 Error Recovery Workflows (~8 tests)

**File**: `src/test/e2e/errorRecovery.e2e.test.ts`

```
├── FC disconnect during log download → error shown, download flag cleared
├── FC disconnect during apply → error shown, partial state handled
├── Corrupt log file → parse error shown, can retry with different log
├── MSP timeout during PID write → error shown, can retry
├── CLI command failure during filter apply → error shown, FC state reported
├── FC doesn't ACK erase → polls until usedSize===0
├── App restart mid-tuning → session state preserved on disk
└── Profile with missing baseline snapshot → auto-recreated on connect
```

---

## 13. Phase 9 — Infrastructure & Tooling

### 13.1 Coverage Reporting

Update `vitest.config.ts` to enforce minimum coverage:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html', 'lcov'],
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 75,
    statements: 80,
  },
  exclude: [
    'node_modules/', 'dist/', 'release/',
    'src/renderer/test/', '**/*.config.ts', '**/*.d.ts',
    '**/types/',           // Type-only files
    'src/main/window.ts',  // Electron window creation (not testable without Electron)
    'src/preload/index.ts', // Preload bridge (thin wrapper)
  ]
}
```

### 13.2 CI Pipeline Enhancements

Add to `.github/workflows/ci.yml`:

```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-node@v4
      with:
        node-version: 20
    - run: npm ci
    - run: npm run test:run
    - run: npm run test:coverage
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v4
      with:
        files: ./coverage/lcov.info
```

### 13.3 Test Data Management

```
src/test/
├── fixtures/
│   ├── bbl/
│   │   ├── bf45-hover-clean.bbl      (~50KB, clean hover flight)
│   │   ├── bf45-acro-steps.bbl       (~100KB, acrobatic with steps)
│   │   ├── bf2025-no-debug.bbl       (~50KB, BF 2025.12 format)
│   │   ├── multi-session.bbl         (~200KB, 3 flights)
│   │   └── corrupt-middle.bbl        (~50KB, corrupt frames mid-file)
│   ├── msp/
│   │   └── mspResponseFactory.ts     (MSP binary response builders)
│   └── profiles/
│       └── sampleProfiles.ts         (pre-built profile objects)
├── e2e/
│   ├── E2ETestHarness.ts             (shared harness for workflow tests)
│   ├── connection.e2e.test.ts
│   ├── snapshot.e2e.test.ts
│   ├── filterTuning.e2e.test.ts
│   ├── pidTuning.e2e.test.ts
│   ├── analysis.e2e.test.ts
│   └── errorRecovery.e2e.test.ts
└── helpers/
    ├── MockMSPClient.ts              (fully stubbed MSP client)
    ├── MockSerialPort.ts             (simulated serial port)
    └── tempDir.ts                    (temp directory management)
```

### 13.4 Test Categorization (Tags)

Use Vitest `describe.concurrent` and test name conventions for selective running:

```bash
# Run only unit tests (fast, < 10s)
npm run test:run -- --grep "unit:"

# Run only integration tests (medium, < 30s)
npm run test:run -- --grep "integration:"

# Run only E2E workflow tests (slow, < 60s)
npm run test:run -- --grep "e2e:"

# Run only BBL real-data tests (depends on fixtures)
npm run test:run -- --grep "realdata:"

# Pre-commit: unit + integration only (< 20s)
# CI: all tests including E2E and real-data
```

### 13.5 Performance Benchmarks

Not strictly tests, but useful for regression detection:

```typescript
describe('performance', () => {
  it('parses 5MB BBL log in < 5 seconds', async () => {
    const start = performance.now();
    await BlackboxParser.parse(largeLogBuffer);
    expect(performance.now() - start).toBeLessThan(5000);
  });

  it('filter analysis completes in < 10 seconds', async () => {
    const start = performance.now();
    await analyzeFilters(realFlightData, 0, defaultSettings);
    expect(performance.now() - start).toBeLessThan(10000);
  });
});
```

---

## 14. Implementation Roadmap

### Priority Order

| Phase | Description | New Tests | Effort | Depends On |
|-------|-------------|-----------|--------|------------|
| **1** | MSP Protocol + Connection | ~120 | 3-4 days | — |
| **2** | Storage Managers | ~100 | 2-3 days | — |
| **3** | IPC Handler Integration | ~200 | 4-5 days | Phase 1, 2 |
| **4** | BBL Parser Hardening | ~30 | 1-2 days | — |
| **5** | Analysis Real-Data Validation | ~20 | 1-2 days | Phase 4 |
| **6** | Remaining UI Components | ~60 | 2-3 days | — |
| **7** | Remaining Hooks | ~33 | 1 day | — |
| **8** | E2E Workflow Tests | ~50 | 3-4 days | Phase 1, 2, 3 |
| **9** | Infrastructure & Tooling | — | 1 day | — |

**Total: ~610 new tests, ~17-24 days of implementation**

### Parallel Tracks

Phases 1, 2, 4, 6, 7, 9 are independent and can be implemented in parallel:

```
Track A: Phase 1 (MSP) → Phase 3 (IPC) → Phase 8 (E2E)
Track B: Phase 2 (Storage) ↗
Track C: Phase 4 (BBL) → Phase 5 (Analysis real-data)
Track D: Phase 6 (UI) + Phase 7 (Hooks)
Track E: Phase 9 (Infrastructure) — anytime
```

### Milestone Targets

| Milestone | Phases Complete | Total Tests | Coverage |
|-----------|----------------|-------------|----------|
| M1: Foundation | 1, 2, 9 | ~1220 | MSP + Storage tested |
| M2: Integration | 3 | ~1420 | All IPC handlers tested |
| M3: UI Complete | 4, 5, 6, 7 | ~1560 | Full UI + analysis coverage |
| M4: E2E | 8 | ~1610 | Complete workflow coverage |

---

## 15. Test Infrastructure Requirements

### New Dev Dependencies

None required. Current stack (Vitest + React Testing Library + jsdom) supports all planned tests.

### New Test Utilities to Build

| Utility | Purpose | Used By |
|---------|---------|---------|
| `MockSerialPort` | Simulates serial port data events | Phase 1 |
| `MSP Response Factory` | Builds typed MSP binary responses | Phase 1, 3, 8 |
| `MockMSPClient` | Full MSP client stub with configurable responses | Phase 3, 8 |
| `E2E Test Harness` | Wires real managers + mock MSP for workflow tests | Phase 8 |
| `Temp Directory Helper` | Creates/cleans temp dirs for storage tests | Phase 2, 3, 8 |
| `BBL Fixture Loader` | Loads test .bbl files with caching | Phase 4, 5 |

### Test Data Files to Collect

| File | Source | Size | Purpose |
|------|--------|------|---------|
| `bf45-hover-clean.bbl` | Real flight (BF 4.5.x hover) | ~50KB | Filter analysis validation |
| `bf45-acro-steps.bbl` | Real flight (BF 4.5.x acro) | ~100KB | PID analysis validation |
| `bf2025-no-debug.bbl` | Real flight (BF 2025.12) | ~50KB | Version compatibility |
| `multi-session.bbl` | Real flight (3 sessions) | ~200KB | Multi-session parsing |
| `corrupt-middle.bbl` | Synthetically corrupted | ~50KB | Recovery testing |

---

## 16. Appendix — File-Level Gap Analysis

### Files That Need Tests (by priority)

**P0 — Must have (blocks autonomous development)**:
1. `src/main/ipc/handlers.ts` → `handlers.test.ts` (200+ tests)
2. `src/main/msp/MSPProtocol.ts` → `MSPProtocol.test.ts` (30 tests)
3. `src/main/msp/MSPConnection.ts` → `MSPConnection.test.ts` (50 tests)
4. `src/main/storage/ProfileManager.ts` → `ProfileManager.test.ts` (25 tests)
5. `src/main/storage/SnapshotManager.ts` → `SnapshotManager.test.ts` (25 tests)

**P1 — Important (improves confidence)**:
6. `src/main/storage/BlackboxManager.ts` → `BlackboxManager.test.ts` (20 tests)
7. `src/main/storage/FileStorage.ts` → `FileStorage.test.ts` (15 tests)
8. `src/main/storage/ProfileStorage.ts` → `ProfileStorage.test.ts` (15 tests)
9. `src/main/msp/MSPClient.ts` → extend existing test (40 tests)
10. `src/renderer/hooks/useBlackboxInfo.ts` → `useBlackboxInfo.test.ts` (10 tests)
11. `src/renderer/hooks/useBlackboxLogs.ts` → `useBlackboxLogs.test.ts` (10 tests)
12. `src/renderer/hooks/useFCInfo.ts` → `useFCInfo.test.ts` (8 tests)

**P2 — Complete coverage (UI polish)**:
13. `src/renderer/components/TuningWizard/WizardProgress.tsx` → test (10 tests)
14. `src/renderer/components/TuningWizard/FilterAnalysisStep.tsx` → test (10 tests)
15. `src/renderer/components/TuningWizard/SessionSelectStep.tsx` → test (8 tests)
16. `src/renderer/components/TuningWizard/TuningSummaryStep.tsx` → test (8 tests)
17. `src/renderer/components/TuningWizard/ApplyConfirmationModal.tsx` → test (8 tests)
18. `src/renderer/components/TuningWizard/RecommendationCard.tsx` → test (8 tests)
19. `src/renderer/components/TuningWizard/charts/AxisTabs.tsx` → test (5 tests)
20. `src/renderer/hooks/useToast.ts` → `useToast.test.ts` (5 tests)

**P3 — Nice to have (infrastructure)**:
21. `src/main/utils/errors.ts` → test (5 tests)
22. `src/main/index.ts` → partial test (smart reconnect logic, 10 tests)
23. E2E workflow tests (50 tests)

### Files Intentionally NOT Tested

| File | Reason |
|------|--------|
| `src/main/window.ts` | Thin Electron wrapper, requires full Electron runtime |
| `src/preload/index.ts` | Thin IPC bridge, type-checked by TypeScript |
| `src/main/utils/logger.ts` | Console wrapper, trivial |
| `src/main/msp/commands.ts` | Constant definitions only |
| `src/main/msp/types.ts` | Type definitions only |
| `src/shared/types/*.types.ts` | Type definitions only (TypeScript compile-time check) |
| `src/renderer/test/setup.ts` | Test infrastructure itself |

---

## Summary

Implementací tohoto plánu dosáhneme:

- **~1600+ testů** (z aktuálních 998)
- **100% funkčního pokrytí** — každá user-facing funkce testována
- **Plně mockovaný MSP layer** — žádné manuální testování s reálným FC
- **E2E workflow testy** — celý tuning cyklus od připojení po aplikaci
- **Reálné BBL logy v testech** — validace parseru a analýzy na skutečných datech
- **Autonomní CI/CD** — Claude může implementovat funkce a ověřit je bez lidské pomoci

Klíčový přínos: Po dokončení fáze 1-3 (MSP + Storage + IPC) bude možné testovat **každou IPC akci** bez připojení k reálnému FC. To odblokuje plně autonomní vývoj.
