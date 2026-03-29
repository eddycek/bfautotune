---
name: e2e-tuning-test
description: >
  Automated E2E testing of the complete tuning workflow via the debug server.
  Walks through Filter Tune and PID Tune workflows using pre-downloaded BBL logs,
  takes screenshots at each step, performs deep UX and quality audit.
user-invocable: true
allowed-tools: Bash, Read, Glob, Grep, Agent, Write
---

# E2E Tuning Workflow Test

Automated test of the full Filter Tune + PID Tune workflow via debug server endpoints.
Uses pre-downloaded BBL logs instead of real flights. Takes screenshots at each step
and performs deep UX/quality audit.

## Prerequisites
- App running: `npm run dev` (real FC connected via USB)
- Debug server active on http://127.0.0.1:9300
- FC connected to current profile
- At least 4 BBL logs downloaded for the current profile

## Configuration
```
BASE=http://127.0.0.1:9300
```

## Phase 0: Preflight

1. **Health check**: `curl -s $BASE/health` → confirm `status: ok`
2. **App state**: `curl -s $BASE/state` → confirm `connected: true`, note profile name
3. **Snapshots**: `curl -s $BASE/snapshots` → find baseline snapshot ID (type=baseline or first Pre-tuning)
4. **BBL logs**: `curl -s $BASE/blackbox-logs` → map the 4 logs by filename to IDs:
   - LOG1: `blackbox_2026-03-29T11-09-44-682Z.bbl` → Filter analysis
   - LOG2: `blackbox_2026-03-29T16-17-37-126Z.bbl` → Filter verification
   - LOG3: `blackbox_2026-03-29T18-00-16-246Z.bbl` → PID analysis
   - LOG4: `blackbox_2026-03-29T18-23-46-100Z.bbl` → PID verification
5. **MSP baseline**: `curl -s $BASE/msp` → capture pre-test PID and filter config
6. **Console clear**: `curl -s $BASE/console` → note any pre-existing errors
7. **Screenshot**: `curl -s $BASE/screenshot` → "preflight baseline" — **audit: dashboard layout, connection panel, FC info**

## Phase 1: Filter Tune Workflow

### 1.1 Reset & Restore Baseline
```bash
curl -s -X POST "$BASE/reset-session"
curl -s -X POST "$BASE/restore-snapshot?id=BASELINE_ID&backup=false"
curl -s -X POST "$BASE/wait-connected?timeout=30000"
```
- **Verify**: `/state` → connected=true
- **Screenshot**: "baseline restored" — **audit: no stale session UI, clean dashboard**

### 1.2 Start Filter Tuning
```bash
curl -s -X POST "$BASE/start-tuning?mode=filter"
```
- **Verify**: `/tuning-session` → phase=`filter_flight_pending`, tuningType=`filter`
- **Verify**: `/snapshots` → new "Pre-tuning #N (Filter Tune)" snapshot exists
- **Screenshot**: "filter session started" — **audit: banner shows 4-step progress, correct step highlighted, buttons visible**

### 1.3 Use Existing Log (skip erase + download)
```bash
curl -s -X POST "$BASE/update-phase?phase=filter_analysis&filterLogId=LOG1_ID"
```
- **Verify**: `/tuning-session` → phase=`filter_analysis`, filterLogId=LOG1_ID

### 1.4 Open Wizard & Review Analysis
```bash
curl -s -X POST "$BASE/open-wizard?logId=LOG1_ID&mode=filter"
sleep 4  # Wait for analysis + chart rendering
```
- **Screenshot**: "filter wizard" — **DEEP AUDIT:**
  - [ ] Noise spectrum chart renders (not empty/loading)
  - [ ] Per-axis lines visible (roll=blue, pitch=orange, yaw=green or similar)
  - [ ] X-axis: frequency (Hz), Y-axis: magnitude (dB) — labels present
  - [ ] Noise floor reference lines visible
  - [ ] Peak markers (if any) at sensible frequencies (80-600 Hz)
  - [ ] Throttle spectrogram heatmap renders with color scale
  - [ ] Throttle bands on y-axis (0-100% range), frequency on x-axis
  - [ ] Recommendations section shows filter setting suggestions
  - [ ] Each recommendation has: setting name, current value, recommended value, confidence, explanation
  - [ ] Data quality badge visible with tier (excellent/good/fair/poor)
  - [ ] No "undefined", "NaN", or "null" in any text
  - [ ] Wizard progress indicator shows correct step

### 1.5 Run Analysis via API (for metric verification)
```bash
curl -s "$BASE/analyze?logId=LOG1_ID" | jq .
```
- **Verify metrics**:
  - [ ] filter.noise.noiseLevel in ["low", "medium", "high"]
  - [ ] Per-axis noise floor dB: reasonable range (-40 to -5 dB)
  - [ ] filter.recommendations[]: valid BF setting names, values in safe range
  - [ ] filter.dataQuality.overall > 0, tier matches score
  - [ ] pid.stepsDetected > 0 (even for filter-focused log, may have some steps)
  - [ ] parse.flightPIDs non-null

### 1.6 Apply Filter Recommendations
```bash
curl -s -X POST "$BASE/apply?logId=LOG1_ID&mode=filter"
```
- Wait for FC reboot:
```bash
curl -s -X POST "$BASE/wait-connected?timeout=30000"
```
- **Verify apply result**: recommendations.filter > 0, apply.success=true
- **Verify MSP**: `curl -s $BASE/msp` → filter cutoffs changed from baseline
- **Verify session**: `/tuning-session` → check `applyVerified`, `applyMismatches`, `applyExpected`, `applyActual`
- **Screenshot**: "filter applied" — **audit:**
  - [ ] Banner shows applied state with verify status
  - [ ] If applyVerified=true: green pill, no warning
  - [ ] If applyVerified=false: amber warning with mismatch count + auto-report message
  - [ ] Post-tuning snapshot created (check /snapshots)
  - [ ] Snapshot badges: Pre-tuning (orange), Post-tuning (green)

### 1.7 Verification Phase
```bash
curl -s -X POST "$BASE/update-phase?phase=filter_verification_pending&verificationLogId=LOG2_ID"
```
- **Verify**: `/tuning-session` → phase=`filter_verification_pending`, verificationLogId=LOG2_ID
- **Screenshot**: "filter verification pending" — **audit: banner shows "Verify" step active**

### 1.8 Close Wizard
Take screenshot of dashboard state after wizard closes.

## Phase 2: PID Tune Workflow

### 2.1 Dismiss Filter Session & Start PID
```bash
curl -s -X POST "$BASE/reset-session"
curl -s -X POST "$BASE/start-tuning?mode=pid"
```
- **Verify**: `/tuning-session` → phase=`pid_flight_pending`, tuningType=`pid`
- **Verify**: `/snapshots` → new "Pre-tuning #N (PID Tune)" snapshot
- **Screenshot**: "PID session started" — **audit: banner shows PID Tune mode, correct step**

### 2.2 Use Existing Log
```bash
curl -s -X POST "$BASE/update-phase?phase=pid_analysis&pidLogId=LOG3_ID"
```

### 2.3 Open Wizard & Review Analysis
```bash
curl -s -X POST "$BASE/open-wizard?logId=LOG3_ID&mode=pid"
sleep 4
```
- **Screenshot**: "PID wizard" — **DEEP AUDIT:**
  - [ ] Step response chart renders (setpoint vs gyro traces)
  - [ ] Per-axis metrics visible: overshoot %, rise time ms, settling time ms, latency ms
  - [ ] Metrics in reasonable ranges (overshoot 0-50%, rise 5-50ms, settling 30-200ms)
  - [ ] Axis tabs work (Roll/Pitch/Yaw)
  - [ ] Current PIDs displayed (from BBL header or FC)
  - [ ] PID recommendations show P/I/D changes per axis
  - [ ] Cross-axis coupling info (if detected)
  - [ ] Prop wash analysis (if detected)
  - [ ] D-term effectiveness shown
  - [ ] No empty charts or missing data

### 2.4 Run Analysis via API
```bash
curl -s "$BASE/analyze?logId=LOG3_ID" | jq .
```
- **Verify metrics**:
  - [ ] pid.stepsDetected > 0 per axis
  - [ ] pid.axisMetrics: overshoot, riseTime, settling, latency per axis
  - [ ] pid.recommendations[]: valid pid_*_p/i/d settings, values 15-120
  - [ ] pid.dTermEffectiveness per axis (0-1 range)

### 2.5 Apply PID Recommendations
```bash
curl -s -X POST "$BASE/apply?logId=LOG3_ID&mode=pid"
curl -s -X POST "$BASE/wait-connected?timeout=30000"
```
- **Verify MSP**: `curl -s $BASE/msp` → PID values changed
- **Verify session**: check applyVerified, applyExpected, applyActual
- **Screenshot**: "PIDs applied" — **audit:**
  - [ ] Same apply verification checks as filter
  - [ ] PID values match recommendations in /msp
  - [ ] Post-tuning snapshot created with correct label

### 2.6 PID Verification Phase
```bash
curl -s -X POST "$BASE/update-phase?phase=pid_verification_pending&verificationLogId=LOG4_ID"
```
- **Screenshot**: "PID verification pending"

## Phase 3: Final Audit

### 3.1 Tuning History
```bash
curl -s "$BASE/tuning-history" | jq .
```
- **Verify**: history contains completed records for both filter and PID sessions (if they reached completed state)

### 3.2 Console Errors
```bash
curl -s "$BASE/console?level=error"
```
- **Verify**: No unexpected errors during workflow

### 3.3 App Logs
```bash
curl -s "$BASE/logs?n=200"
```
- **Verify**: No errors/warnings related to apply, verification, or analysis
- Check for: "Apply verify" log lines, "Auto-report" mentions, snapshot creation logs

### 3.4 All Snapshots Review
```bash
curl -s "$BASE/snapshots" | jq .
```
- **Verify**:
  - [ ] Baseline snapshot exists
  - [ ] Pre-tuning snapshots have correct numbering (#1, #2)
  - [ ] Post-tuning snapshots have correct numbering
  - [ ] Role badges match (pre-tuning/post-tuning)
  - [ ] CLI diff previews look reasonable (set commands present)

### 3.5 Overall UX Summary
Review ALL collected screenshots for:
- [ ] Consistent visual design across all states
- [ ] No overlapping elements, cut-off text, or layout breaks
- [ ] Color coding consistent (green=ok, amber=warning)
- [ ] Progress indicators accurate at each step
- [ ] Smooth transitions (no flash of loading states in screenshots)
- [ ] No "undefined", "null", "NaN" anywhere
- [ ] Buttons labeled correctly for each phase

## Issue Tracking

When issues are found, document:
1. **Screenshot number** where issue appears
2. **Category**: UX bug / visual glitch / wrong data / missing feature / PR regression
3. **Severity**: blocker / major / minor / cosmetic
4. **Description** and expected vs actual behavior
5. **Fix**: file + line where fix is needed

After fixes: re-run affected steps and re-screenshot to verify.

## Done Criteria
- [ ] All screenshots pass visual audit
- [ ] All metrics within expected ranges
- [ ] Apply verification works (applyVerified field set correctly)
- [ ] Snapshots created correctly with proper labels and numbering
- [ ] No console errors or unexpected log warnings
- [ ] MSP read-back matches applied values
- [ ] PR #361 features validated (full-config verify, auto-report, merge mode)
