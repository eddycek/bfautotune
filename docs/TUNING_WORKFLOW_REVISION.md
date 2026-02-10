# Tuning Workflow Revision: Stateful Two-Flight Iterative Approach

> **Status**: Implemented (17/19 steps done)
> **Date**: 2026-02-10
> **Scope**: Tuning Wizard, Flight Guide, Analysis Engine, IPC, Storage, UX Flow

---

## 1. Why This Change Is Needed

### 1.1 Problem: Filters Affect PID Data Quality

The current wizard analyzes both filters and PIDs from the same flight — a single
blackbox log. This means step response data for PID analysis is recorded with the
old (potentially bad) filter settings. A noisy gyro signal contaminates step response
metrics:

- **False overshoot** — noise spikes near the setpoint look like oscillation
- **False ringing** — noise is interpreted as bounce-back, leading to unnecessary D increases
- **Inaccurate rise time** — noise masks the true gyro ramp
- **Inaccurate settling time** — noise delays settling detection (±2% tolerance)

After applying both changes at once, PID recommendations are never validated against
a clean signal.

### 1.2 Problem: Hover Is Insufficient for Filter Analysis

The current flight guide asks for hover (10–15s + 5–10s). `SegmentSelector` looks for
segments with throttle 15–75% and gyro std < 50 °/s — i.e. only steady hovers.

The community (PIDtoolbox, Oscar Liang, UAV Tech, roninUAV) unanimously recommends
**throttle sweeps** (slowly ramping throttle from hover to 100% over 5–10s). Reasons:

- Motor noise changes with RPM. A hover captures only one point on the curve.
- Frame resonances appear as constant frequencies across the full throttle range — this
  cannot be identified from a single hover.
- The community explicitly states: *"Avoid random cruising or just hovering — these
  produce logs with very little meaningful information"* for filter tuning.

### 1.3 Community Standard: Filters First, PIDs Second

Oscar Liang, PIDtoolbox, and UAV Tech all recommend an iterative approach:

1. **Flight 1**: Collect filter data → analyze → apply filters → reboot
2. **Flight 2**: Collect PID data (with clean filters) → analyze → apply PIDs → reboot
3. **Optional flight 3**: Verification

This approach is convergent: each step works with data that reflects previous changes.
The current single-flight approach is not convergent — PID analysis runs on data that
does not match the recommended filters.

### 1.4 Problem: No Guided State Across Sessions

The current app has no memory of tuning progress. When the user disconnects to fly,
reconnects, and downloads a new log, the app treats it as a completely fresh interaction.
The user must manually remember where they are in the process. This leads to confusion
and errors — especially for beginners who are the primary audience.

---

## 2. Identified Deficiencies (6 Items)

### D1 — No Throttle Sweep for Filter Analysis [CRITICAL]

**Current state**: Flight guide asks for hover only. `SegmentSelector` filters for
steady segments (throttle 15–75%, gyro std < 50 °/s).

**Problem**: FFT sees noise at only one throttle level. `FilterRecommender` may suggest
filters that are too aggressive or too weak at other throttle levels.

**Solution**: Add a throttle sweep phase to the filter flight guide. Extend
`SegmentSelector` with a throttle-ramp mode that finds segments with monotonically
changing throttle across a wide range.

### D2 — No Logging Rate or Debug Mode Guidance [CRITICAL]

**Current state**: The app never specifies what logging rate or debug mode to use.

**Problem**: At 500 Hz logging rate the Nyquist limit is 250 Hz — FFT cannot see motor
noise (typically 200–600 Hz). Without `GYRO_SCALED` debug mode, FFT analyzes post-filter
data, which defeats the purpose of noise analysis.

**Solution**: Add a pre-flight checklist recommending logging rate 2 kHz and debug mode
`GYRO_SCALED`. Validate these values from the BBL header after parsing.

### D3 — No Motor Temperature Warning [CRITICAL]

**Current state**: After applying filter or PID changes, there is no safety warning.

**Problem**: More aggressive filters (higher cutoff) or higher PID gains can cause motor
overheating. The community recommends checking motor temperature after every tuning flight.

**Solution**: Add a safety warning to the post-apply screen and to the next-flight guide.

### D4 — No Mixed Stick Input Intensities [MEDIUM]

**Current state**: Guide says "stick fully left, center, fully right, center".

**Problem**: Plasmatree PID-Analyzer distinguishes inputs above and below 500 °/s. Brian
White's "basement tuning" method uses moderate inputs. Full-stick-only snaps capture only
the high-authority response curve.

**Solution**: Recommend a mix: "Some half-stick snaps and some full-stick snaps for
better coverage."

### D5 — No Rate Profile Guidance [MEDIUM]

**Current state**: Guide does not mention rate profile. `StepDetector` requires minimum
100 °/s magnitude and 500 °/s/s derivative.

**Problem**: Users with very low max rate (< 300 °/s) or aggressive RC smoothing may
produce weak step data where `StepDetector` catches too few steps or captures distorted
responses.

**Solution**: Add a tip: "Use your normal rate profile. Max rates below 300 °/s may
produce insufficient step data."

### D6 — Feedforward Interference in Step Response [LOW]

**Current state**: `StepMetrics` and `PIDRecommender` do not distinguish feedforward
contribution from P/D response.

**Problem**: Feedforward accelerates the initial response and can cause overshoot that
`PIDRecommender` incorrectly attributes to excessive P gain.

**Solution**: Add a note to the PID flight guide: "For the most accurate results, consider
temporarily disabling feedforward before the test flight." Long-term: extend `StepMetrics`
to detect FF contribution from the BBL header.

---

## 3. Stateful Tuning Session Model

### 3.1 Overview

The core change is introducing a **persistent tuning session** that tracks the user's
progress across connect/disconnect cycles. The app knows where the user is in the
tuning process and guides them to the next step.

### 3.2 Tuning Session File

**Location**: `{userData}/data/tuning/{profileId}.json`

**Lifecycle**:
- Created when the user starts tuning for a profile
- Updated at each phase transition
- Deleted (or archived) when tuning is completed or manually reset

```typescript
export interface TuningSession {
  /** Profile this session belongs to */
  profileId: string;

  /** Current phase of the tuning process */
  phase: TuningPhase;

  /** When the session was started */
  startedAt: string;

  /** When the phase last changed */
  updatedAt: string;

  /** Snapshot ID created before tuning started (safety backup) */
  baselineSnapshotId?: string;

  /** Log ID of the filter test flight (after download) */
  filterLogId?: string;

  /** Summary of applied filter changes (for reference in PID phase) */
  appliedFilterChanges?: AppliedChange[];

  /** Log ID of the PID test flight (after download) */
  pidLogId?: string;

  /** Summary of applied PID changes */
  appliedPIDChanges?: AppliedChange[];

  /** Log ID of the verification flight (after download) */
  verificationLogId?: string;
}

export type TuningPhase =
  | 'filter_flight_pending'   // Waiting for user to fly filter test flight
  | 'filter_log_ready'        // FC reconnected, ready to download filter log
  | 'filter_analysis'         // Filter log downloaded, analyzing
  | 'filter_applied'          // Filters applied, flash erased, ready for PID flight
  | 'pid_flight_pending'      // Waiting for user to fly PID test flight
  | 'pid_log_ready'           // FC reconnected, ready to download PID log
  | 'pid_analysis'            // PID log downloaded, analyzing
  | 'pid_applied'             // PIDs applied, flash erased, ready for verification
  | 'verification_pending'    // Waiting for verification flight
  | 'completed'               // Tuning done
  ;

export interface AppliedChange {
  setting: string;
  previousValue: number;
  newValue: number;
}
```

### 3.3 Phase Transitions

```
User starts tuning
        │
        ▼
┌──────────────────────┐
│ filter_flight_pending │  UI: "Erase flash, disconnect, and fly the filter
│                      │       test flight (hover + throttle sweeps)."
└──────────┬───────────┘
           │  FC reconnects
           ▼
┌──────────────────────┐
│ filter_log_ready     │  UI: "Welcome back! Download your blackbox log
│                      │       to start filter analysis."
└──────────┬───────────┘
           │  Log downloaded
           ▼
┌──────────────────────┐
│ filter_analysis      │  UI: Wizard opens with mode='filter'.
│                      │      Shows FFT results + recommendations.
│                      │      User clicks "Apply Filters".
└──────────┬───────────┘
           │  Filters applied, FC reboots, flash erased
           ▼
┌──────────────────────┐
│ pid_flight_pending   │  UI: "Filters applied! Disconnect and fly the
│                      │       PID test flight (stick snaps on all axes)."
└──────────┬───────────┘
           │  FC reconnects
           ▼
┌──────────────────────┐
│ pid_log_ready        │  UI: "Welcome back! Download your blackbox log
│                      │       to start PID analysis."
└──────────┬───────────┘
           │  Log downloaded
           ▼
┌──────────────────────┐
│ pid_analysis         │  UI: Wizard opens with mode='pid'.
│                      │      Shows step response results + recommendations.
│                      │      User clicks "Apply PIDs".
└──────────┬───────────┘
           │  PIDs applied, FC reboots, flash erased
           ▼
┌──────────────────────┐
│ verification_pending │  UI: "PIDs applied! Fly normally to verify the feel.
│                      │       Reconnect and download the log for a final check."
└──────────┬───────────┘
           │  FC reconnects + log downloaded + verified
           ▼
┌──────────────────────┐
│ completed            │  UI: "Tuning complete! Your quad is dialed in."
│                      │      Option: "Start new tuning cycle" or dismiss.
└──────────────────────┘
```

### 3.4 How the App Detects Phase

On each FC connection, the app:

1. Loads `TuningSession` for the current profile (if exists)
2. Reads `session.phase`
3. Displays a **status banner** in the main UI indicating the next step
4. Provides a **primary action button** that takes the user to the correct action

The app does **not** auto-run actions (MVP approach). It tells the user what to do and
provides the button to do it. Examples:

| Phase | Banner Text | Primary Button |
|-------|------------|----------------|
| `filter_flight_pending` | "Erase Blackbox, disconnect, and fly the filter test flight." | "Erase Flash" |
| `filter_log_ready` | "Filter test flight detected. Download the log to begin analysis." | "Download Log" |
| `filter_analysis` | "Log ready. Run filter analysis." | "Open Filter Wizard" |
| `pid_flight_pending` | "Filters applied. Erase Blackbox and fly the PID test flight." | "Erase Flash" |
| `pid_log_ready` | "PID test flight detected. Download the log." | "Download Log" |
| `pid_analysis` | "Log ready. Run PID analysis." | "Open PID Wizard" |
| `verification_pending` | "PIDs applied. Fly a verification flight and download the log." | "Erase Flash" |
| `completed` | "Tuning complete!" | "Start New Cycle" / dismiss |

### 3.5 Detecting "User Has Flown"

The app infers that the user has flown by checking the Blackbox flash state on
reconnection:

- If flash was erased (by the app) before disconnect, and flash now has data →
  the user has flown
- This is already detectable via `MSP_DATAFLASH_SUMMARY` (used bytes > 0)
- On reconnect: if `tuningSession.phase` is `*_flight_pending` and flash has data →
  transition to `*_log_ready`

### 3.6 Resetting / Abandoning a Tuning Session

- **Manual reset**: User can click "Reset tuning progress" at any time, which deletes
  the session file and returns to a clean state
- **Profile deletion**: Deleting a profile also deletes its tuning session file
- **Starting over**: User can start a new tuning cycle at any time (creates a new session)

---

## 4. UX Flow (Screen by Screen)

### 4.1 First Launch / No Tuning In Progress

The main dashboard shows the normal UI — connection panel, profile info, snapshots.
No tuning-related UI is shown until the user initiates it.

**Entry point**: A prominent "Start Tuning" button on the dashboard (or in the
BlackboxStatus area). Clicking it:

1. Creates a safety snapshot (baseline backup)
2. Creates a new `TuningSession` with `phase: 'filter_flight_pending'`
3. Shows the **filter flight guide** with pre-flight checklist
4. Offers to erase Blackbox flash

### 4.2 Tuning In Progress — Status Banner

When a `TuningSession` exists for the current profile, a **persistent status banner**
appears at the top of the dashboard. The banner:

- Shows the current phase as a step indicator (Step 1/5, Step 2/5, etc.)
- Displays a short instruction text for the next action
- Has a primary action button
- Has a small "Reset tuning" link

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔧 Tuning in progress — Step 2 of 5                           │
│                                                                 │
│ Filters applied! Disconnect your drone and fly the PID test    │
│ flight. Do stick snaps on all axes (roll, pitch, yaw).         │
│                                                                 │
│ [View PID Flight Guide]              [Erase Flash & Prepare]   │
│                                                    Reset tuning │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 FC Reconnect — Smart Detection

When the FC reconnects and a tuning session is in a `*_flight_pending` phase:

1. App checks Blackbox flash: does it have data?
2. If yes → transition to `*_log_ready` → banner updates:
   "Welcome back! Your flight data is ready. Download it to continue."
3. If no → stay in `*_flight_pending` → banner shows:
   "No flight data found. Make sure Blackbox logging is enabled and fly again."

### 4.4 Filter Wizard (mode='filter')

After log download, the wizard opens in filter-only mode:

- **Flight Guide step**: Shows filter-specific guide (hover + throttle sweeps) —
  serves as a reference / "did you do this?" confirmation
- **Session Select**: Select flight session from the log
- **Filter Analysis**: FFT spectrum, noise profile, filter recommendations
- **Filter Summary**: Only filter recommendations shown. Buttons:
  - "Apply Filters" → applies filter changes, erases flash, reboots FC
  - After success: session transitions to `pid_flight_pending`

### 4.5 PID Wizard (mode='pid')

Same structure but for PID:

- **Flight Guide step**: Shows PID-specific guide (stick snaps)
- **Session Select**: Select session
- **PID Analysis**: Step response charts, PID recommendations
- **PID Summary**: Only PID recommendations. Buttons:
  - "Apply PIDs" → applies PID changes, erases flash, reboots FC
  - After success: session transitions to `verification_pending`

### 4.6 Verification Phase

After PID flight:

- User flies normally
- On reconnect, downloads log
- App runs both filter and PID analysis on the verification data
- Shows a **comparison view**: before vs. after metrics
- If everything looks good → session transitions to `completed`
- If issues detected → suggests another tuning cycle

### 4.7 Tuning Complete

Banner changes to success state:

```
┌─────────────────────────────────────────────────────────────────┐
│ ✅ Tuning complete!                                             │
│                                                                 │
│ Your filters and PIDs have been optimized. The quad should feel │
│ more locked in with less noise and vibration.                   │
│                                                                 │
│ [Dismiss]                          [Start New Tuning Cycle]     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Implementation Plan

### Architecture Diagram

```
BEFORE (current):                      AFTER (new):

1 flight → 1 log → Wizard:            Start Tuning
  Flight Guide                               │
  Session Select                     ┌───────▼────────┐
  Filter Analysis                    │ Tuning Session  │ ← {userData}/data/tuning/{profileId}.json
  PID Analysis                       │ (persistent)    │
  Summary + Apply all                └───────┬────────┘
                                             │
                                     ┌───────▼────────┐
                                     │ Flight 1       │ hover + throttle sweep
                                     │ Filter Wizard  │ → apply filters → reboot
                                     └───────┬────────┘
                                             │
                                     ┌───────▼────────┐
                                     │ Flight 2       │ stick snaps
                                     │ PID Wizard     │ → apply PIDs → reboot
                                     └───────┬────────┘
                                             │
                                     ┌───────▼────────┐
                                     │ Flight 3       │ verification
                                     │ Final Check    │ → done
                                     └────────────────┘
```

---

### Step 1: New Types and Constants ✅ PR #23

**Files to modify**:
- `src/shared/types/tuning.types.ts` (new file)
- `src/shared/constants/flightGuide.ts`

**Changes**:

1.1. Create `src/shared/types/tuning.types.ts` with `TuningSession`, `TuningPhase`,
and `AppliedChange` interfaces as defined in section 3.2.

1.2. In `flightGuide.ts`, split `FLIGHT_PHASES` into two sets:

```typescript
export const FILTER_FLIGHT_PHASES: FlightPhase[] = [
  {
    title: 'Take off & Hover',
    duration: '10–15 sec',
    description: 'Hover steadily at mid-throttle. Stay as still as possible. This gives clean baseline noise data.',
  },
  {
    title: 'Throttle Sweep',
    duration: '2–3 times',
    description: 'Slowly increase throttle from hover to full power over 5–10 seconds, then reduce back. Repeat 2–3 times. This reveals how noise changes with motor speed.',
  },
  {
    title: 'Final Hover',
    duration: '5–10 sec',
    description: 'Hover again for additional data.',
  },
  {
    title: 'Land',
    duration: '',
    description: 'Done! Total flight: 30–45 seconds.',
  },
];

export const PID_FLIGHT_PHASES: FlightPhase[] = [
  {
    title: 'Take off & Hover',
    duration: '5 sec',
    description: 'Brief hover to stabilize before starting snaps.',
  },
  {
    title: 'Roll Snaps',
    duration: '5–8 times',
    description: 'Quick, sharp roll inputs — mix half-stick and full-stick. Stick left, center, right, center. Pause briefly between each.',
  },
  {
    title: 'Pitch Snaps',
    duration: '5–8 times',
    description: 'Same with pitch — forward, center, back, center. Quick and decisive. Mix intensities.',
  },
  {
    title: 'Yaw Snaps',
    duration: '3–5 times',
    description: 'Quick yaw movements left and right with brief pauses.',
  },
  {
    title: 'Land',
    duration: '',
    description: 'Done! Total flight: 20–40 seconds.',
  },
];
```

1.3. Split `FLIGHT_TIPS` into two sets:

```typescript
export const FILTER_FLIGHT_TIPS: string[] = [
  'Fly in calm weather — wind adds unwanted noise to the data',
  'Stay at 2–5 meters altitude',
  'Keep the drone as still as possible during hover phases',
  'Throttle sweeps should be slow and smooth — no jerky movements',
  'Make sure Blackbox logging is enabled with 2 kHz rate',
  'Set debug_mode = GYRO_SCALED in Betaflight for best results',
  'After landing, check motor temperatures — if too hot to touch, do not reduce filters further',
];

export const PID_FLIGHT_TIPS: string[] = [
  'Fly in calm weather — wind makes step response data noisy',
  'Stay at 2–5 meters altitude',
  'Mix half-stick and full-stick snaps for better coverage',
  "Don't do flips or rolls, just snaps",
  'Use your normal rate profile (min 300 deg/s recommended)',
  'Make sure Blackbox logging is enabled with 2 kHz rate',
  'After landing, check motor temperatures',
];
```

1.4. Keep the existing `FLIGHT_PHASES` and `FLIGHT_TIPS` exports for backward compatibility
with `mode='full'`.

1.5. Add `TuningMode` type:

```typescript
export type TuningMode = 'filter' | 'pid' | 'full';
```

---

### Step 2: TuningSessionManager (Backend) ✅ PR #24

**New file**: `src/main/storage/TuningSessionManager.ts`

**Purpose**: CRUD operations for tuning session files. Follows the same pattern as
`ProfileManager` and `SnapshotManager`.

```typescript
export class TuningSessionManager {
  private dataDir: string;  // {userData}/data/tuning/

  constructor(basePath: string);

  async initialize(): Promise<void>;  // ensures directory exists

  async getSession(profileId: string): Promise<TuningSession | null>;

  async createSession(profileId: string): Promise<TuningSession>;

  async updatePhase(profileId: string, phase: TuningPhase, extraData?: Partial<TuningSession>): Promise<TuningSession>;

  async deleteSession(profileId: string): Promise<void>;
}
```

**Key behaviors**:
- One file per profile: `{profileId}.json`
- Read on FC connect to determine what to show
- Updated on phase transitions (apply, download, etc.)
- Deleted on manual reset or profile deletion

---

### Step 3: IPC Handlers for Tuning Session ✅ PR #27

**Files to modify**:
- `src/main/ipc/handlers.ts`
- `src/shared/types/ipc.types.ts`
- `src/preload/index.ts`

**New IPC channels**:

```typescript
// In IPCChannel enum:
TUNING_GET_SESSION = 'tuning:get-session',
TUNING_START_SESSION = 'tuning:start-session',
TUNING_UPDATE_PHASE = 'tuning:update-phase',
TUNING_RESET_SESSION = 'tuning:reset-session',
```

**New BetaflightAPI methods**:

```typescript
getTuningSession(): Promise<TuningSession | null>;
startTuningSession(): Promise<TuningSession>;
updateTuningPhase(phase: TuningPhase, data?: Partial<TuningSession>): Promise<TuningSession>;
resetTuningSession(): Promise<void>;
```

**Handler logic**:
- `TUNING_GET_SESSION`: Load session for current profile, return null if none exists
- `TUNING_START_SESSION`: Create safety snapshot, create new session with
  `phase: 'filter_flight_pending'`, return session
- `TUNING_UPDATE_PHASE`: Validate the transition is legal (see state machine),
  update file, return updated session
- `TUNING_RESET_SESSION`: Delete session file for current profile

---

### Step 4: Smart Reconnect Detection ✅ PR #27

**Files to modify**:
- `src/main/ipc/handlers.ts` (connection changed handler)

**Changes**:

4.1. When FC connects and a tuning session exists in a `*_flight_pending` phase:

```typescript
// In the connection-changed event handler:
if (connectionStatus === 'connected' && tuningSession) {
  const flashInfo = await mspClient.getDataflashSummary();
  const hasFlightData = flashInfo.usedBytes > 0;

  if (tuningSession.phase === 'filter_flight_pending' && hasFlightData) {
    await tuningSessionManager.updatePhase(profileId, 'filter_log_ready');
  }
  if (tuningSession.phase === 'pid_flight_pending' && hasFlightData) {
    await tuningSessionManager.updatePhase(profileId, 'pid_log_ready');
  }
  if (tuningSession.phase === 'verification_pending' && hasFlightData) {
    // Stays in verification_pending until user downloads and reviews
  }
}
```

4.2. Send an event to the renderer when tuning session phase changes:

```typescript
EVENT_TUNING_SESSION_CHANGED = 'event:tuning-session-changed',
```

---

### Step 5: TuningStatusBanner Component ✅ PR #29

**New files**:
- `src/renderer/components/TuningStatusBanner/TuningStatusBanner.tsx`
- `src/renderer/components/TuningStatusBanner/TuningStatusBanner.css`

**Purpose**: Persistent banner shown at the top of the dashboard when a tuning session
is active. Displays the current phase, instruction text, and a primary action button.

**Props**:

```typescript
interface TuningStatusBannerProps {
  session: TuningSession;
  onAction: (action: TuningAction) => void;
  onViewGuide: (mode: TuningMode) => void;
  onReset: () => void;
}

type TuningAction =
  | 'erase_flash'
  | 'download_log'
  | 'open_filter_wizard'
  | 'open_pid_wizard'
  | 'start_new_cycle'
  | 'dismiss';
```

**Rendering logic**: Maps `session.phase` to the UI table from section 3.4. Each phase
renders a specific text + button combination.

**Step indicator**: Shows progress across 5 steps: "Prepare → Filter Flight → Filter
Tune → PID Flight → PID Tune". The current phase maps to one of these steps.

---

### Step 6: useTuningSession Hook ✅ PR #29

**New file**: `src/renderer/hooks/useTuningSession.ts`

**Purpose**: Manages tuning session state in the renderer. Provides reactive access to
the current session and methods for phase transitions.

```typescript
export function useTuningSession() {
  const [session, setSession] = useState<TuningSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Load session on mount and when profile changes
  useEffect(() => { ... }, []);

  // Subscribe to session change events
  useEffect(() => {
    return window.betaflight.onTuningSessionChanged((updated) => {
      setSession(updated);
    });
  }, []);

  const startSession = async () => { ... };
  const resetSession = async () => { ... };
  const updatePhase = async (phase: TuningPhase, data?: Partial<TuningSession>) => { ... };

  return { session, loading, startSession, resetSession, updatePhase };
}
```

---

### Step 7: Update useTuningWizard Hook ✅ PR #28

**Files to modify**:
- `src/renderer/hooks/useTuningWizard.ts`

**Changes**:

7.1. Add `mode: TuningMode` parameter:

```typescript
export function useTuningWizard(logId: string, mode: TuningMode = 'full'): UseTuningWizardReturn
```

7.2. Add `mode` to the return interface.

7.3. Update auto-advance logic in `parseLog`:
- `mode === 'filter'`: after parsing, advance to `'filter'` step (skip PID)
- `mode === 'pid'`: after parsing, advance to `'pid'` step (skip filter)
- `mode === 'full'`: current behavior

7.4. Update `confirmApply` to send only relevant recommendations:
- `mode === 'filter'`: send `pidRecommendations: []`
- `mode === 'pid'`: send `filterRecommendations: []`
- `mode === 'full'`: current behavior

7.5. After successful apply, update the tuning session phase:
- `mode === 'filter'`: call `updateTuningPhase('pid_flight_pending', { appliedFilterChanges })`
- `mode === 'pid'`: call `updateTuningPhase('verification_pending', { appliedPIDChanges })`

---

### Step 8: Update TuningWizard Component ✅ PR #30

**Files to modify**:
- `src/renderer/components/TuningWizard/TuningWizard.tsx`

**Changes**:

8.1. Add `mode` prop:

```typescript
interface TuningWizardProps {
  logId: string;
  mode: TuningMode;
  onExit: () => void;
}
```

8.2. Pass `mode` to `useTuningWizard(logId, mode)`.

8.3. In `renderStep()`, skip steps based on mode:
- `mode === 'filter'`: guide → session → filter → summary (skip pid)
- `mode === 'pid'`: guide → session → pid → summary (skip filter)

---

### Step 9: Update WizardProgress Component ✅ PR #30

**Files to modify**:
- `src/renderer/components/TuningWizard/WizardProgress.tsx`

**Changes**:

9.1. Add `mode` prop and dynamically filter STEPS:

```typescript
interface WizardProgressProps {
  currentStep: WizardStep;
  mode: TuningMode;
}

// Dynamic steps by mode:
// filter: Flight Guide → Session → Filters → Summary
// pid:    Flight Guide → Session → PIDs → Summary
// full:   Flight Guide → Session → Filters → PIDs → Summary
```

---

### Step 10: Update FlightGuideContent Component ✅ PR #28

**Files to modify**:
- `src/renderer/components/TuningWizard/FlightGuideContent.tsx`

**Changes**:

10.1. Add `mode` prop:

```typescript
interface FlightGuideContentProps {
  mode?: TuningMode;  // default 'full' for backward compatibility
}
```

10.2. Select phases and tips based on mode:
- `'filter'` → `FILTER_FLIGHT_PHASES` + `FILTER_FLIGHT_TIPS`
- `'pid'` → `PID_FLIGHT_PHASES` + `PID_FLIGHT_TIPS`
- `'full'` → existing `FLIGHT_PHASES` + `FLIGHT_TIPS`

---

### Step 11: Update TestFlightGuideStep ✅ PR #28

**Files to modify**:
- `src/renderer/components/TuningWizard/TestFlightGuideStep.tsx`

**Changes**:

11.1. Add `mode` prop and pass to `FlightGuideContent`.

11.2. Adjust intro text by mode:
- `'filter'`: "Follow this flight plan to collect noise data for filter tuning."
- `'pid'`: "Follow this flight plan to collect step response data for PID tuning.
  Your filters have been tuned — this flight will produce cleaner data."
- `'full'`: existing text

---

### Step 12: Update TuningSummaryStep ✅ PR #30

**Files to modify**:
- `src/renderer/components/TuningWizard/TuningSummaryStep.tsx`

**Changes**:

12.1. Add `mode` prop.

12.2. Adjust button text and post-apply messaging by mode:
- `mode === 'filter'`:
  - Button: "Apply Filters" instead of "Apply Changes"
  - After success: "Filters applied! Next: erase Blackbox, fly the PID test flight
    (stick snaps on all axes), then reconnect to continue tuning."
  - Safety box: "After your next flight, check motor temperatures."
- `mode === 'pid'`:
  - Button: "Apply PIDs" instead of "Apply Changes"
  - After success: "PIDs applied! Fly a normal flight to verify the feel, then
    reconnect to download the verification log."
- `mode === 'full'`: current behavior

12.3. Show only relevant sections:
- `mode === 'filter'`: hide PID section
- `mode === 'pid'`: hide filter section
- `mode === 'full'`: show both

---

### Step 13: Dashboard Integration ✅ PR #31

**Files to modify**:
- `src/renderer/components/BlackboxStatus.tsx` (or main dashboard component)
- `src/renderer/App.tsx` (or main layout)

**Changes**:

13.1. Import and render `TuningStatusBanner` when a tuning session exists.

13.2. Add "Start Tuning" button to the dashboard (visible when no tuning session active
and FC is connected).

13.3. Wire action handlers:
- `erase_flash` → call `window.betaflight.eraseBlackboxFlash()`
- `download_log` → trigger existing log download flow
- `open_filter_wizard` → open TuningWizard with `mode='filter'`
- `open_pid_wizard` → open TuningWizard with `mode='pid'`
- `start_new_cycle` → call `startTuningSession()`
- `dismiss` → call `resetTuningSession()`

---

### Step 14: Update TuningWorkflowModal ✅ PR #31

**Files to modify**:
- `src/renderer/components/TuningWorkflowModal/TuningWorkflowModal.tsx`
- `src/shared/constants/flightGuide.ts`

**Changes**:

14.1. Update `TUNING_WORKFLOW` to reflect the two-flight process:

```typescript
export const TUNING_WORKFLOW: WorkflowStep[] = [
  { title: 'Connect your drone', description: 'Plug in via USB and wait for connection.' },
  { title: 'Create a backup', description: 'Save a snapshot of your current settings.' },
  { title: 'Check Blackbox setup', description: 'Set logging rate to 2 kHz and debug_mode to GYRO_SCALED.' },
  { title: 'Erase Blackbox data', description: 'Clear old logs for a clean recording.' },
  { title: 'Fly: Filter test flight', description: 'Hover + throttle sweeps (~30 sec). Follow the filter flight guide.' },
  { title: 'Analyze & apply filters', description: 'Download the log. Run the Filter Wizard. Apply changes.' },
  { title: 'Erase Blackbox data again', description: 'Clear the filter flight log.' },
  { title: 'Fly: PID test flight', description: 'Stick snaps on all axes (~30 sec). Follow the PID flight guide.' },
  { title: 'Analyze & apply PIDs', description: 'Download the log. Run the PID Wizard. Apply changes.' },
  { title: 'Verify', description: 'Fly normally and check the feel. Repeat if needed.' },
];
```

14.2. Show two separate flight guides (filter + PID) with visual divider.

---

### Step 15: Extend SegmentSelector for Throttle Sweep ✅ PR #25

**Files to modify**:
- `src/main/analysis/SegmentSelector.ts`
- `src/main/analysis/constants.ts`

**Changes**:

15.1. Add new function `findThrottleSweepSegments()`:

```typescript
export function findThrottleSweepSegments(flightData: BlackboxFlightData): FlightSegment[] {
  // Detect segments where throttle monotonically increases or decreases
  // across at least 40% of the throttle range (e.g. from hover to 90%+)
  // over 2–15 seconds. These segments contain noise data across the full
  // RPM range.
}
```

15.2. Add new constants:

```typescript
/** Minimum throttle range covered by a sweep (0-1 scale) */
export const SWEEP_MIN_THROTTLE_RANGE = 0.4;

/** Minimum sweep duration in seconds */
export const SWEEP_MIN_DURATION_S = 2.0;

/** Maximum sweep duration in seconds */
export const SWEEP_MAX_DURATION_S = 15.0;

/** Maximum throttle regression residual for "monotonic" classification */
export const SWEEP_MAX_RESIDUAL = 0.15;
```

15.3. Update `FilterAnalyzer` (orchestrator) to:
- First look for throttle sweep segments via `findThrottleSweepSegments()`
- If found → use them (higher quality)
- If not found → fall back to `findSteadySegments()` (backward compatibility)
- Report in `FilterAnalysisResult` which segment type was used

---

### Step 16: BBL Header Validation (Logging Rate, Debug Mode) ✅ PR #26

**Files to modify**:
- `src/main/analysis/FilterAnalyzer.ts`
- `src/main/analysis/PIDAnalyzer.ts`
- `src/shared/types/analysis.types.ts`

**Changes**:

16.1. Add validation after BBL parsing:
- Extract `looptime` (→ logging rate) and `debug_mode` from BBL header
- If logging rate < 2 kHz: add warning to the result
- If debug_mode !== GYRO_SCALED: add warning to the result

16.2. Extend `FilterAnalysisResult` and `PIDAnalysisResult` with a warnings field:

```typescript
export interface AnalysisWarning {
  code: 'low_logging_rate' | 'wrong_debug_mode' | 'no_sweep_segments' | 'few_steps';
  message: string;
  severity: 'info' | 'warning' | 'error';
}

// Add to both result types:
warnings: AnalysisWarning[];
```

16.3. Display warnings in `FilterAnalysisStep` and `PIDAnalysisStep` above the results.

---

### Step 17: Apply Handler — Auto-Erase Flash After Apply ⏳ TODO

**Files to modify**:
- `src/main/ipc/handlers.ts`

**Changes**:

17.1. After a successful apply + reboot in the `TUNING_APPLY_RECOMMENDATIONS` handler,
the FC reboots and the connection is lost. The app cannot erase flash at that point.

17.2. Instead, the `TuningStatusBanner` for the next phase (`pid_flight_pending` or
`verification_pending`) will prompt the user to erase flash as the first action. The
primary button for these phases is "Erase Flash & Prepare".

17.3. No changes to the apply handler are needed. The existing handler already supports
selective application (empty arrays are skipped).

---

### Step 18: Update Tests ✅ (covered in each PR)

**Files to modify / create**:
- `src/main/storage/TuningSessionManager.test.ts` (new)
- `src/renderer/hooks/useTuningSession.test.ts` (new)
- `src/renderer/components/TuningStatusBanner/TuningStatusBanner.test.tsx` (new)
- `src/renderer/components/TuningWizard/TuningWizard.test.tsx`
- `src/renderer/hooks/useTuningWizard.test.ts`
- `src/main/analysis/SegmentSelector.test.ts`
- `src/renderer/components/TuningWorkflowModal/TuningWorkflowModal.test.tsx`

**New tests**:

18.1. **TuningSessionManager**:
- Creates session file in `{dataDir}/tuning/{profileId}.json`
- Returns null for non-existent sessions
- Updates phase and preserves existing data
- Deletes session file on reset
- Handles concurrent reads/writes

18.2. **useTuningSession**:
- Returns null when no session exists
- Loads session on mount
- Updates when session changed event fires
- startSession creates new session
- resetSession clears session

18.3. **TuningStatusBanner**:
- Renders correct text and button for each phase
- Calls onAction with correct action type
- Shows step indicator with correct progress
- Shows reset link

18.4. **useTuningWizard**:
- `mode='filter'` skips PID step and goes to summary
- `mode='pid'` skips filter step
- `mode='full'` goes through all steps (existing behavior)
- `confirmApply` with `mode='filter'` sends empty `pidRecommendations`
- `confirmApply` with `mode='pid'` sends empty `filterRecommendations`

18.5. **TuningWizard**:
- With `mode='filter'`, does not render PID Analysis step
- With `mode='pid'`, does not render Filter Analysis step
- WizardProgress shows correct steps for each mode

18.6. **FlightGuideContent**:
- With `mode='filter'`, shows throttle sweep phases and filter tips
- With `mode='pid'`, shows snap phases and PID tips
- Default mode shows existing phases

18.7. **SegmentSelector**:
- `findThrottleSweepSegments()` finds a linear throttle ramp
- Ignores short ramps below `SWEEP_MIN_DURATION_S`
- Ignores non-monotonic throttle data
- Falls back to `findSteadySegments()` when no sweep segments exist

18.8. **TuningWorkflowModal**:
- Renders updated two-flight workflow steps

18.9. **TuningSummaryStep**:
- In `mode='filter'`, shows safety warning and next-step instructions
- In `mode='pid'`, shows only PID results and verification prompt

---

### Step 19: Update Documentation ✅ PR #32

**Files to modify**:
- `CLAUDE.md` — Tuning Wizard section, Architecture section, Storage section
- `ARCHITECTURE.md`
- `SPEC.md`

**Changes**:

19.1. Add description of the Tuning Session system to the Architecture section.

19.2. Update Tuning Wizard description to explain the two-mode system.

19.3. Document new IPC channels and types.

19.4. Document the new constants in `constants.ts`.

19.5. Add `TuningStatusBanner` to the component list.

---

## 6. Implementation Order and Dependencies

```
Step 1  (types + constants)              ← foundation, no dependencies
  │
  ├── Step 2  (TuningSessionManager)     ← depends on step 1
  │     │
  │     ├── Step 3  (IPC handlers)       ← depends on step 2
  │     │     │
  │     │     └── Step 4  (reconnect)    ← depends on step 3
  │     │
  │     └── Step 6  (useTuningSession)   ← depends on step 3
  │           │
  │           └── Step 5  (StatusBanner) ← depends on step 6
  │                 │
  │                 └── Step 13 (dashboard integration) ← depends on step 5
  │
  ├── Step 7  (useTuningWizard)          ← depends on step 1
  │     │
  │     ├── Step 8  (TuningWizard)       ← depends on step 7
  │     ├── Step 9  (WizardProgress)     ← depends on step 7
  │     └── Step 12 (TuningSummary)      ← depends on step 7
  │
  ├── Step 10 (FlightGuideContent)       ← depends on step 1
  │     │
  │     └── Step 11 (TestFlightGuide)    ← depends on step 10
  │
  ├── Step 14 (TuningWorkflowModal)      ← depends on step 1
  │
  ├── Step 15 (SegmentSelector)          ← independent (backend)
  │
  └── Step 16 (BBL validation)           ← independent (backend)

Step 17 (Apply handler)                  ← no changes needed
Step 18 (Tests)                          ← after each step, incrementally
Step 19 (Documentation)                  ← at the end
```

**Recommended implementation waves**:

1. **Wave 1** (foundation): Steps 1, 2, 15, 16
2. **Wave 2** (backend integration): Steps 3, 4
3. **Wave 3** (wizard updates): Steps 7, 10, 11
4. **Wave 4** (UI components): Steps 5, 6, 8, 9, 12
5. **Wave 5** (integration): Steps 13, 14
6. **Wave 6** (finalization): Steps 18, 19

---

## 7. Scope Summary

| Area | New Files | Modified Files | Estimated Scope |
|------|:-:|:-:|---|
| Types and constants | 1 | 1 | Small |
| TuningSessionManager (backend) | 1 | 0 | Small |
| IPC handlers + preload | 0 | 3 | Medium |
| Smart reconnect detection | 0 | 1 | Small |
| TuningStatusBanner | 2 | 0 | Medium |
| useTuningSession hook | 1 | 0 | Small |
| useTuningWizard hook | 0 | 1 | Medium |
| Wizard UI components | 0 | 6 | Medium |
| SegmentSelector (backend) | 0 | 2 | Medium |
| BBL validation (backend) | 0 | 3 | Small |
| Dashboard integration | 0 | 2 | Small |
| Workflow modal | 0 | 2 | Small |
| Tests | 3 | 4–5 | Medium |
| Documentation | 0 | 3 | Small |
| **Total** | **~8** | **~25** | |

---

## 8. Backward Compatibility

- `TuningMode = 'full'` preserves the existing single-flight behavior completely
- Existing `FLIGHT_PHASES` and `FLIGHT_TIPS` exports remain unchanged
- The IPC handler `TUNING_APPLY_RECOMMENDATIONS` requires no changes — selective
  application works out-of-the-box (empty arrays are skipped)
- Users without a tuning session see the normal dashboard — no new UI unless they
  click "Start Tuning"
- No breaking changes to existing types — new fields are optional or additive

---

## 9. Risks and Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|:-:|:-:|---|
| User does not understand the two-flight process | Medium | Medium | Clear status banner with specific instructions at each step; TuningWorkflowModal explains the full process |
| Throttle sweep detection has false positives | Low | Low | Fall back to hover segments; conservative thresholds |
| Users with RPM filter may not need throttle sweeps | Low | Low | Detect RPM filter from BBL header; adjust advice accordingly |
| Flash data from a non-tuning flight confuses detection | Medium | Low | Phase transition only happens for `*_flight_pending` states; user can always reset |
| Tuning session file gets corrupted | Low | Low | Validate JSON on load; if invalid, treat as no session (fresh start) |
| Tests do not cover new edge cases | Medium | Medium | Incremental test writing alongside each step (step 18 is distributed) |
