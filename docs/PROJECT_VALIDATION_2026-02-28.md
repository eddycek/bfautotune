# Project Validation Report — 2026-02-28

> **Status**: Active — Tracking 8 bugs/issues + 7 enhancements

Deep functional validation of all subsystems. Each item has a severity/priority rating, verified code references, and a fix/implementation plan.

---

## Executive Summary

**Project is functional and production-ready for its target audience** (beginner-to-intermediate FPV pilots). Architecture, test coverage (1,884 tests), and documentation are enterprise-grade. The core pipeline (connect → download BBL → FFT analysis → filter recommendations → auto-apply) works correctly.

**Critical gap**: PID recommendations are directionally correct but too simplistic for advanced tuning. The project needs deeper analysis capabilities (Wiener deconvolution, throttle spectrogram) to compete with specialized tools like PIDtoolbox and Plasmatree PID-Analyzer.

### Issues Found

| # | Issue | Severity | Status | Branch |
|---|-------|----------|--------|--------|
| V1 | MSP parseBuffer() jumbo frame offset | **Critical** | Open | — |
| V2 | CLI command verification missing | **High** | Open | — |
| V3 | PID recommendations too simplistic | **High** | Open | — |
| V4 | Quality score ignores verification data | **Medium** | Open | — |
| V5 | No throttle spectrogram | **Medium** | Open | — |
| V6 | No Wiener deconvolution | **Medium** | Open | — |
| V7 | Cross-axis coupling detection missing | **Low** | Open | — |
| V8 | Propwash-aware filter floor missing | **Low** | Open | — |

### Enhancements Planned

| # | Enhancement | Priority | Status | Branch |
|---|-------------|----------|--------|--------|
| E1 | I-term recommendations | **High** | Open | — |
| E2 | Continuous FF classification | **High** | Open | — |
| E3 | Filter group delay estimation | **Medium** | Open | — |
| E4 | Chirp flight analysis (BF 4.6+) | **Medium** | Open | — |
| E5 | Prop wash event detection | **Medium** | Open | — |
| E6 | D-term noise-to-effectiveness ratio | **Medium** | Open | — |
| E7 | Multi-flight Bayesian optimization | **Low** | Open | — |

### Previously Identified Bugs (Now Fixed)

These bugs were documented in `BBL_PARSER_VALIDATION.md` and have been fixed:
- NEG_14BIT encoding formula → Fixed with `signExtend14Bit()` (`ValueDecoder.ts:114-117`)
- TAG8_8SVB count==1 special case → Fixed (`ValueDecoder.ts:142-146`)
- AVERAGE_2 truncation direction → Fixed with `Math.trunc()` (`PredictorApplier.ts:114-116`)

---

## V1: MSP parseBuffer() Jumbo Frame Offset (Critical)

### Location

`src/main/msp/MSPProtocol.ts:211-212`

### Description

The `parseBuffer()` method correctly delegates jumbo frame decoding to `decodeJumbo()`, but calculates the wrong offset to advance past the decoded message:

```typescript
const message = this.decode(buffer.slice(offset));
if (message) {
  messages.push(message);
  const size = buffer[offset + 3]; // ← BUG: reads 0xFF (jumbo flag), not actual size
  offset += 6 + size;             // ← advances by 261 instead of 8 + actualSize
}
```

For standard frames: `buffer[offset + 3]` is the 1-byte size → correct.
For jumbo frames: `buffer[offset + 3]` is `0xFF` (jumbo flag) → the actual 16-bit size is at `buffer[offset + 4..5]`.

### Impact

**HIGH** — When multiple MSP messages arrive in one buffer and one is a jumbo frame, all subsequent messages in that buffer are silently lost or corrupted. This can happen during blackbox flash download (4096-byte reads produce jumbo responses).

In practice, the impact is partially mitigated because MSP communication is typically request-response (one message per buffer), but during high-throughput operations (flash download), multiple responses can batch.

### Fix Plan

```typescript
if (message) {
  messages.push(message);
  const sizeOrFlag = buffer[offset + 3];
  if (sizeOrFlag === 0xFF) {
    // Jumbo frame: 8-byte header + 16-bit size
    const jumboSize = buffer.readUInt16LE(offset + 4);
    offset += 8 + jumboSize;
  } else {
    // Standard frame: 6-byte header + 1-byte size
    offset += 6 + sizeOrFlag;
  }
}
```

### Tests Needed

1. `parseBuffer` with single jumbo frame → correct decode
2. `parseBuffer` with standard frame followed by jumbo frame → both decoded
3. `parseBuffer` with jumbo frame followed by standard frame → both decoded
4. `parseBuffer` with multiple jumbo frames → all decoded
5. `parseBuffer` with incomplete jumbo frame → returns remaining buffer
6. Edge case: jumbo frame with size exactly 255 (boundary between standard and jumbo)

---

## V2: CLI Command Verification Missing (High)

### Location

`src/main/ipc/handlers/tuningHandlers.ts:114,138`
`src/main/msp/MSPConnection.ts:265-308`

### Description

When auto-applying filter/feedforward recommendations via CLI, the code sends `set` commands but **never validates the response**:

```typescript
// tuningHandlers.ts:114
await mspClient.connection.sendCLICommand(cmd);
appliedFilters++;  // ← assumes success without checking response
```

`sendCLICommand()` resolves when it sees the `# ` prompt, returning the raw response text. But the calling code discards this return value.

If a setting name has a typo (e.g., `set gyro_lpf1_static_hzz = 200`), BF CLI responds with `Invalid name` but the code treats it as success. Result: **partially applied settings with no error detection**.

### Impact

**HIGH** — A pilot could think their filter/PID settings were applied when they weren't. The safety snapshot mechanism provides rollback, but the user would need to manually identify the issue.

Current risk is moderate because setting names are hardcoded constants (not user input), but any future changes to BF CLI naming would silently break apply.

### Fix Plan

1. Capture the response from `sendCLICommand()`:
   ```typescript
   const response = await mspClient.connection.sendCLICommand(cmd);
   if (response.includes('Invalid') || response.includes('Unknown')) {
     throw new Error(`CLI command rejected: ${cmd} → ${response.trim()}`);
   }
   ```

2. Add a `validateCLIResponse()` helper that checks for BF CLI error patterns

3. On validation failure: abort apply, report which command failed, leave FC in known state

### Tests Needed

1. Unit: `validateCLIResponse()` with valid response → pass
2. Unit: `validateCLIResponse()` with "Invalid name" → throw
3. Unit: `validateCLIResponse()` with "Unknown command" → throw
4. Integration: Apply handler with mocked CLI error → returns error IPCResponse
5. Integration: Apply handler with partial failure → reports failed command index

---

## V3: PID Recommendations Too Simplistic (High)

### Location

`src/main/analysis/PIDRecommender.ts`
`src/main/analysis/StepMetrics.ts`
`src/main/analysis/constants.ts`

### Description

The PID recommendation engine has several limitations that reduce its utility for intermediate-to-advanced pilots:

#### 3a. Sequential P/D adjustments instead of simultaneous

Current: D first, then P (independently). Each axis processes overshoot → D+step, then checks sluggish → P+step.

Problem: Real-world PID tuning requires **coupled P/D adjustment** — when you increase D by 10, P can safely increase by 3-5 without adding overshoot. The PID controller is a coupled system; tuning one gain in isolation is suboptimal.

#### 3b. Fixed 300ms response window

`RESPONSE_WINDOW_MS = 300` in `constants.ts`. This is appropriate for 5" freestyle quads but:
- Tiny whoops (1-3") settle in ~100-150ms
- Large quads (7-10") need 400-500ms
- No adaptive detection based on actual settling behavior

#### 3c. No I-term recommendations

The I-term is never adjusted, even though it's responsible for:
- Steady-state tracking error (drift during hover)
- Wind disturbance rejection
- Slow oscillation (I-term windup)

#### 3d. No damping ratio (ζ) calculation

Standard control theory metric. ζ = 0.7 is ideal (critically damped). Pilots would understand "ζ=0.4 → underdamped, increase D" better than raw "D+5".

Can be computed from overshoot: `ζ = -ln(OS/100) / sqrt(π² + ln²(OS/100))`

#### 3e. Feedforward classification is binary

Only checks if `|pidF| > |pidP|` at the peak point. Should integrate FF contribution over the entire step response.

### Impact

**HIGH** — PID recommendations are the primary value proposition. Beginner pilots get safe but slow-converging suggestions. Advanced pilots would ignore them.

### Fix Plan (Multi-PR)

**PR 1: Simultaneous P/D with damping ratio**
- Compute damping ratio from overshoot
- Map (ζ, riseTime) → (ΔP, ΔD) lookup table
- Replace sequential rules with coupled recommendation
- ~200 lines code, ~30 tests

**PR 2: Adaptive response window**
- Auto-detect settling time from data
- Use 2× median settling time as window
- Fallback to 300ms if insufficient data
- ~100 lines code, ~15 tests

**PR 3: I-term recommendations**
- Measure steady-state tracking error
- Detect I-term windup (slow oscillation <5 Hz)
- Recommend I increase for drift, decrease for windup
- ~150 lines code, ~20 tests

**PR 4: Continuous FF classification**
- Integrate FF energy over step duration
- Compute FF/PID energy ratio
- Better FF-dominated vs PID-dominated classification
- ~100 lines code, ~15 tests

### Dependencies

- PR 1 is standalone (no prerequisites)
- PR 2 is standalone
- PR 3 requires PR 1 (damping ratio context)
- PR 4 is standalone

---

## V4: Quality Score Ignores Verification Data (Medium)

### Location

`src/shared/utils/tuneQualityScore.ts`
`src/shared/utils/metricsExtract.ts`

### Description

The flight quality score (0-100) is computed from filter and PID metrics. When a verification flight is performed after PID apply, the verification data (noise spectrum) is stored in the tuning record but **never influences the quality score**.

This means:
- Filter tuning reduces noise from -25 dB to -45 dB → quality score improves
- PID tuning adds 5 dB of noise through higher D-term → quality score does NOT decrease
- Verification flight detects this regression but score doesn't reflect it

### Impact

**MEDIUM** — Quality score can be misleading. A session with degraded noise after PID apply still shows high quality score because verification noise isn't factored in.

### Fix Plan

1. Add optional `verificationMetrics` parameter to `computeTuneQualityScore()`
2. When verification data available, use it for noise floor component instead of filter-flight data
3. Add "Noise Delta" component (+points for improvement, -points for regression)
4. ~50 lines code, ~10 tests

---

## V5: No Throttle Spectrogram (Medium)

### Location

Related: `TUNING_PRECISION_IMPROVEMENTS.md` §2 (documented as proposed)

### Description

Current FFT analysis produces a single averaged spectrum across hover segments. Noise characteristics change significantly with throttle level (motor RPM scaling), but this information is lost in the average.

A 2D throttle × frequency spectrogram reveals:
- Motor harmonic tracking (diagonal lines) — even without RPM telemetry
- Frame resonance (horizontal lines at constant frequency)
- Throttle ranges with worst noise
- Electrical noise patterns (vertical lines >500 Hz)

### Impact

**MEDIUM** — This is a major diagnostic feature that BF Configurator doesn't have. It would be a competitive differentiator and significantly improve filter recommendation quality.

### Fix Plan

Already documented in `TUNING_PRECISION_IMPROVEMENTS.md` §2. Implementation:

1. `ThrottleSpectrogram.ts` — Bin gyro data by throttle (10 bins), compute PSD per bin
2. `SpectrogramChart.tsx` — 2D heatmap (Recharts or custom canvas)
3. Integration into FilterAnalyzer and AnalysisOverview
4. ~300 lines code, ~25 tests, ~200 lines UI

### Dependencies

- Standalone, no prerequisites

---

## V6: No Wiener Deconvolution (Medium)

### Location

Related: `TUNING_PRECISION_IMPROVEMENTS.md` §1 (documented as proposed)

### Description

Current PID analysis requires dedicated stick-snap flights. General freestyle/race flights produce no PID recommendations. Wiener deconvolution computes the system transfer function from **any** flight data:

```
H(f) = FFT(gyro) * conj(FFT(setpoint)) / (|FFT(setpoint)|² + noise_regularization)
```

This produces bandwidth, gain margin, and phase margin from which optimal PID gains can be derived. It's the technique used by Plasmatree PID-Analyzer.

### Impact

**MEDIUM** — Would eliminate the requirement for dedicated stick-snap flights, making the tool useful for any recorded flight. This is the single biggest feature gap compared to Plasmatree PID-Analyzer.

### Fix Plan

Already documented in `TUNING_PRECISION_IMPROVEMENTS.md` §1. Implementation:

1. `TransferFunctionEstimator.ts` — Wiener deconvolution, H(f) computation
2. `BodePlot.tsx` — Bode magnitude/phase chart
3. Integration into PIDAnalyzer (additive, not replacement)
4. ~400 lines code, ~30 tests, ~250 lines UI

### Dependencies

- Benefits from V5 (throttle data binning) but not required

---

## V7: Cross-Axis Coupling Detection Missing (Low)

### Location

Related: `TUNING_PRECISION_IMPROVEMENTS.md` §9 (documented as proposed)

### Description

Current analysis assumes axes are independent. In practice, roll inputs can produce pitch responses (and vice versa) due to asymmetric mass distribution, flex, or gyro mounting angle.

### Impact

**LOW** — Affects quads with mechanical issues. Detection is valuable as a diagnostic but doesn't change PID recommendations significantly.

### Fix Plan

Already documented in `TUNING_PRECISION_IMPROVEMENTS.md` §9. Measure response on non-commanded axes during step analysis. Flag coupling >10% as mechanical issue.

1. ~100 lines code, ~15 tests

---

## V8: Propwash-Aware Filter Floor Missing (Low)

### Location

Related: `TUNING_PRECISION_IMPROVEMENTS.md` §5 (documented as proposed)

### Description

`FilterRecommender` can push gyro LPF1 below 100 Hz, which kills propwash handling. Need a propwash floor (minimum cutoff frequency) that adapts to flight style.

### Impact

**LOW** — Only affects quads with extreme noise that pushes filters very low. Safety bounds partially mitigate this already.

### Fix Plan

Already documented in `TUNING_PRECISION_IMPROVEMENTS.md` §5.

1. Add `PROPWASH_FLOOR_HZ` constant per flight style
2. Clamp filter recommendations
3. ~30 lines code, ~10 tests

---

## E1: I-Term Recommendations (High Priority Enhancement)

### Location

`src/main/analysis/PIDRecommender.ts` (new rules)
`src/main/analysis/StepMetrics.ts` (new metric extraction)

### Description

The I-term is currently never adjusted. This is a significant gap because I-term controls:
- **Steady-state tracking accuracy** — drift during hover or straight-line flight
- **Wind disturbance rejection** — how quickly the quad returns to target after external forces
- **I-term windup** — slow oscillation when I is too high, especially on yaw

### Proposed Analysis

1. **Steady-state error**: Measure `|setpoint - gyro|` during the hold phase of each step (after settling). High error → I too low.
2. **I-term windup detection**: Band-pass gyro data at 1-5 Hz during non-maneuvering segments. High energy → I too high (slow oscillation).
3. **Per-axis I tracking error**: `trackingErrorRMS` already computed in `StepMetrics` — use it for I recommendations.

### Recommendation Logic

```
IF steady-state error > threshold AND I < max → increase I by 5-10
IF low-frequency oscillation detected AND I > min → decrease I by 5-10
IF settling time > threshold AND overshoot low AND ringing low → I may be too low (slow convergence)
```

### Fix Plan

- New: `computeITermMetrics()` in `StepMetrics.ts` — steady-state error + low-freq oscillation detection
- Modified: `PIDRecommender.ts` — Rule 5 (I-term adjustment)
- Modified: `analysis.types.ts` — `ITermMetrics` type
- ~150 lines code, ~20 tests

---

## E2: Continuous Feedforward Classification (High Priority Enhancement)

### Location

`src/main/analysis/StepMetrics.ts:ffDominated` classification
`src/main/analysis/PIDRecommender.ts` (FF-aware rules)

### Description

Current FF classification is binary: checks `|pidF| > |pidP|` at the single peak overshoot point. This misses cases where FF contributes significant energy across the whole step response but is not dominant at the peak.

### Proposed Improvement

1. **Energy-based classification**: Integrate `|pidF|²` and `|pidP|²` over the step response window (0 to settling time)
2. **FF contribution ratio**: `ffEnergyRatio = ffEnergy / (ffEnergy + pidPEnergy)`
3. **Continuous classification**: Instead of boolean `ffDominated`, report `ffContribution: 0.0-1.0`
4. **Recommendation thresholds**:
   - `ffContribution > 0.6` → FF-dominated, recommend FF tuning
   - `ffContribution 0.3-0.6` → Mixed, recommend both FF and P/D
   - `ffContribution < 0.3` → PID-dominated, recommend P/D only

### Fix Plan

- Modified: `StepMetrics.ts` — compute `ffEnergyRatio` per step
- Modified: `PIDRecommender.ts` — replace binary FF check with ratio-based logic
- Modified: `analysis.types.ts` — `ffContribution: number` on `StepResponse`
- ~100 lines code, ~15 tests

---

## E3: Filter Group Delay Estimation (Medium Priority Enhancement)

### Location

New: `src/main/analysis/FilterGroupDelay.ts`
Modified: `FilterRecommender.ts`, filter analysis UI

### Description

Users don't see the latency cost of their filter configuration. More filtering = less noise but more delay = worse propwash handling. Computing group delay makes the noise-vs-latency tradeoff visible.

### Proposed Implementation

1. Compute group delay of each filter stage (LPF1, LPF2, dynamic notch, RPM notch) at key frequencies:
   - 50 Hz (propwash band)
   - 100 Hz (aggressive maneuvering)
   - 200 Hz (typical PID bandwidth)
2. Sum total group delay across the chain
3. Display as: "Filter latency at 80 Hz: 2.3 ms (good)" with traffic-light indicator
4. Compare before/after when recommending filter changes

### Group Delay Formulas

For first-order Butterworth LPF at frequency f with cutoff fc:
```
delay(f) = 1 / (2π × fc × (1 + (f/fc)²))
```

For second-order biquad (BF's filter type):
```
delay(f) = d(phase) / d(ω) — computed numerically from biquad coefficients
```

### Fix Plan

- New: `FilterGroupDelay.ts` — group delay computation per filter stage
- Modified: `FilterRecommender.ts` — include delay metrics in recommendations
- Modified: UI — delay indicator in filter analysis
- ~200 lines code, ~20 tests

---

## E4: Chirp Flight Analysis — BF 4.6+ (Medium Priority Enhancement)

### Location

Related: `TUNING_PRECISION_IMPROVEMENTS.md` §7

### Description

BF 2025.12 (4.6+) added a built-in **chirp signal generator** — a swept-frequency oscillation injected into one axis at a time. This produces ideal data for frequency response estimation (much better than Wiener deconvolution on random inputs).

### Proposed Implementation

1. **Chirp detection**: Identify swept-sine pattern in setpoint data (linearly increasing frequency, constant amplitude)
2. **Cross-spectral density**: `H(f) = Sxy(f) / Sxx(f)` — more robust than Wiener for chirp inputs
3. **Bode plot**: Magnitude + phase vs frequency
4. **Optimal PID**: Compute gain/phase margins and recommend PID gains for target bandwidth

### Fix Plan

- New: `ChirpDetector.ts` — detect chirp segments in flight data
- New: `ChirpAnalyzer.ts` — cross-spectral density, bandwidth, margins
- Depends on: `BodePlot.tsx` from V6 (Wiener deconvolution)
- ~300 lines code, ~25 tests

### Dependencies

- Requires BF 4.6+ (API version gate already handles this)
- Benefits from V6 (shared BodePlot chart component)
- Can detect chirp from BBL headers (`debug_mode = CHIRP` or similar)

---

## E5: Prop Wash Event Detection (Medium Priority Enhancement)

### Location

Related: `PROPWASH_AND_DTERM_DIAGNOSTICS.md` Feature 1 (fully designed, proposed status)

### Description

Prop wash oscillation (30-80 Hz during throttle-down events) is the most common flight quality complaint. Current pipeline actively **excludes** these segments from analysis. Detecting and quantifying prop wash would:
- Track prop wash improvement across tuning sessions
- Inform D-term and I-term recommendations
- Help pilots understand if their issue is PID-related or mechanical

### Proposed Implementation

Fully documented in `PROPWASH_AND_DTERM_DIAGNOSTICS.md`:
1. `PropWashDetector.ts` — throttle-down event detection + 30-80 Hz band energy scoring
2. Per-axis severity: ratio of prop wash band energy vs baseline hover noise
3. Integration with `PIDRecommender` and tuning history

### Fix Plan

- New: `src/main/analysis/PropWashDetector.ts` + tests
- Modified: `PIDAnalyzer.ts`, `PIDRecommender.ts`, types
- ~200 lines code, ~20-25 tests

---

## E6: D-Term Noise-to-Effectiveness Ratio (Medium Priority Enhancement)

### Location

Related: `PROPWASH_AND_DTERM_DIAGNOSTICS.md` Feature 2 (fully designed, proposed status)

### Description

D-gain is the most sensitive PID parameter. The current pipeline recommends D changes based solely on overshoot. It has no measure of the **noise cost** of D-gain. The D-term effectiveness ratio quantifies useful damping vs noise injection:

```
effectiveness = functional_energy (20-150 Hz) / noise_energy (>150 Hz)
```

- Ratio > 3.0 → D is efficient, safe to increase
- Ratio 1.0-3.0 → balanced, generating significant noise
- Ratio < 1.0 → D is mostly amplifying noise, reduce D or improve filters first

### Proposed Implementation

Fully documented in `PROPWASH_AND_DTERM_DIAGNOSTICS.md`:
1. `DTermAnalyzer.ts` — PSD of axisD field in functional vs noise bands
2. Per-axis ratio + overall rating
3. Gate D-increase recommendations: don't recommend D+ when ratio < 1.0

### Fix Plan

- New: `src/main/analysis/DTermAnalyzer.ts` + tests
- Modified: `PIDRecommender.ts` — ratio-gated D recommendations
- ~150 lines code, ~15-20 tests

---

## E7: Multi-Flight Bayesian Optimization (Low Priority Enhancement)

### Location

Related: `TUNING_PRECISION_IMPROVEMENTS.md` §11

### Description

Single-flight heuristic recommendations may not converge to optimal gains. Across multiple tuning sessions, a Gaussian Process model can map PID gains → performance metrics and suggest the next set of gains that maximizes expected improvement.

### Proposed Implementation

1. Collect (PID gains, quality score) pairs from tuning history
2. Fit Gaussian Process with RBF kernel
3. Use Expected Improvement acquisition function to suggest next gains
4. Requires minimum 3+ completed sessions with comparable data
5. Display as "Suggested next gains" alongside heuristic recommendations

### Fix Plan

- New: `src/main/analysis/BayesianOptimizer.ts` — GP fitting, EI acquisition
- Modified: `PIDRecommender.ts` — optional Bayesian suggestion alongside rules
- Complex math library dependency (GP regression)
- ~400 lines code, ~30 tests

### Dependencies

- Requires tuning history with consistent metrics (already available)
- Needs 3+ sessions for meaningful predictions
- Consider lightweight GP library or implement from scratch (RBF kernel + Cholesky)

---

## Competitive Analysis

### Strengths vs Competition

| Feature | BFAutoTune | BF Configurator | Plasmatree | PIDtoolbox |
|---------|-----------|----------------|------------|------------|
| Filter recommendations | **Yes** | No | No | No |
| Auto-apply | **Yes** | No | No | No |
| Data quality scoring | **Yes** | No | No | No |
| Multi-drone profiles | **Yes** | No | No | No |
| Snapshot rollback | **Yes** | No | No | No |
| Guided wizard | **Yes** | No | No | No |
| Tuning history | **Yes** | No | No | No |

### Weaknesses vs Competition

| Feature | BFAutoTune | BF Configurator | Plasmatree | PIDtoolbox |
|---------|-----------|----------------|------------|------------|
| Real-time FFT | No | **Yes** | No | No |
| Transfer function | No | No | **Yes** | **Yes** |
| Damping ratio | No | No | No | **Yes** |
| Throttle spectrogram | No | No | No | **Yes** |
| Works with any flight | No | N/A | **Yes** | **Yes** |
| Confidence intervals | No | No | No | **Yes** |

---

## Implementation Priority

Recommended order based on user impact, effort, and dependencies:

### Phase A: Critical Fixes (immediate)

| # | Item | Type | Effort | Impact |
|---|------|------|--------|--------|
| 1 | V1 — MSP jumbo frame fix | Bug | ~1 hour | Prevents data corruption |
| 2 | V2 — CLI command verification | Bug | ~2 hours | Silent failure prevention |
| 3 | V8 — Propwash filter floor | Bug | ~1 hour | Safety improvement |

### Phase B: PID Quality Leap (high impact)

| # | Item | Type | Effort | Impact |
|---|------|------|--------|--------|
| 4 | V3a — Simultaneous P/D + damping ratio | Fix | ~4 hours | Biggest PID quality jump |
| 5 | V4 — Quality score verification | Fix | ~2 hours | Score accuracy |
| 6 | V3b — Adaptive response window | Fix | ~2 hours | Multi-size quad support |
| 7 | E2 — Continuous FF classification | Enhancement | ~3 hours | Better FF handling |
| 8 | E6 — D-term effectiveness ratio | Enhancement | ~4 hours | Smart D gating |

### Phase C: Analysis Depth (competitive features)

| # | Item | Type | Effort | Impact |
|---|------|------|--------|--------|
| 9 | V5 — Throttle spectrogram | Fix | ~8 hours | Killer diagnostic feature |
| 10 | E1 — I-term recommendations | Enhancement | ~4 hours | Complete PID coverage |
| 11 | E5 — Prop wash detection | Enhancement | ~5 hours | Most-requested diagnostic |
| 12 | E3 — Filter group delay | Enhancement | ~4 hours | Noise-latency tradeoff visibility |

### Phase D: Game Changers (long-term)

| # | Item | Type | Effort | Impact |
|---|------|------|--------|--------|
| 13 | V6 — Wiener deconvolution | Fix | ~12 hours | Works with any flight |
| 14 | E4 — Chirp analysis (BF 4.6+) | Enhancement | ~8 hours | Most precise tuning |
| 15 | V7 — Cross-axis coupling | Fix | ~2 hours | Diagnostic |
| 16 | E7 — Multi-flight Bayesian optimization | Enhancement | ~12 hours | Convergent optimization |

**Total estimated effort**: ~72 hours across 15 items

---

## Revision History

| Date | Change |
|------|--------|
| 2026-02-28 | Initial validation report — 8 issues + 7 enhancements identified |
