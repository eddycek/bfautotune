# Flash Tune Recommendation Parity

> **Status**: Active (PRs #203–#205: Tasks 1, 2, 3, 4, 5, 6 done)

## Problem Statement

Flash Tune (Wiener deconvolution) currently produces significantly weaker PID recommendations than Deep Tune (step response analysis). The root cause is **duplicated, incomplete orchestration** — `analyzeTransferFunction()` is a stripped-down copy of `analyzePID()` that was never brought to parity.

### Current State: Two Divergent Pipelines

`PIDAnalyzer.ts` contains two orchestrator functions that should share post-processing but don't:

```
analyzePID() [Deep Tune]:                    analyzeTransferFunction() [Flash Tune]:
─────────────────────────────────            ─────────────────────────────────────────
1. detectSteps + computeStepResponse         1. estimateAllAxes (Wiener deconvolution)
2. aggregateAxisMetrics → AxisStepProfile    2. Build AxisStepProfile from TF metrics
   ─── SHARED POST-PROCESSING ───              ─── INCOMPLETE COPY ───
3. scorePIDDataQuality          ✅           3. ❌ missing (scoreWienerDataQuality exists but unused!)
4. analyzeCrossAxisCoupling     ✅           4. ❌ missing (needs steps — OK)
5. extractFeedforwardContext    ✅           5. ✅ has
6. analyzePropWash              ✅           6. ❌ missing
7. analyzeDTermEffectiveness    ✅           7. ❌ missing
8. analyzeFeedforward           ✅           8. ❌ missing
9. recommendPID(all params)     ✅           9. recommendPID(incomplete) ❌
10. recommendFeedforward        ✅           10. ❌ missing
11. adjustConfidenceByQuality   ✅           11. blanket MEDIUM cap ❌
12. bayesianSuggestion          ✅           12. ❌ missing
13. sliderPosition/Delta        ✅           13. ✅ has
```

### Why It Matters

1. Flash Tune may recommend D increases on noisy quads (no D-term gating)
2. Flash Tune ignores prop wash — a common real-world issue
3. Quality score is structurally lower for Flash Tune (fewer components → less resolution)
4. Users choosing Flash Tune for convenience get meaningfully worse advice
5. Every new analysis module must be added to both functions — easy to miss

## Reference: Plasmatree PID-Analyzer

Plasmatree is a **diagnostic/visualization tool** — it does NOT generate automatic recommendations. It displays:
- Step response via Wiener deconvolution (same math as our Flash Tune)
- Response vs throttle heatmap (we don't have this yet)
- Noise spectrum heatmap by throttle band

Our Flash Tune extends Plasmatree's technique by **extracting metrics and generating automatic recommendations**. This design doc brings those recommendations to parity with Deep Tune.

## Validation: Why the Same Recommendations Work for Both Modes

Before unifying the pipeline, we validated that shared recommendations genuinely make sense for both tuning modes. The key insight: **time-domain and frequency-domain analysis detect the same physical problems through different lenses.**

### Shared Post-Processing (raw flight data — identical in both modes)

| Analysis | Input | Mode-dependent? |
|----------|-------|-----------------|
| PropWash detection | throttle + gyro from flight data | No — identical raw data |
| D-term effectiveness | gyro + pidD from flight data | No — identical raw data |
| Damping ratio validation | recommended P/D values (output) | No — validates output, not input |
| FF context (headers) | BBL headers | No — same source |
| Bayesian optimizer | history (PID → score) | No — method-agnostic |

### PID Rules: Already Branched by Mode

`recommendPID()` already branches on `responses.length`:
- `responses.length > 0` → **time-domain rules** (Deep Tune)
- `responses.length === 0 && tfMetrics` → **frequency-domain rules** (Flash Tune)

These never mix. Each physical problem is detected through the appropriate lens:

| Physical Problem | Deep Tune Detection | Flash Tune Detection |
|-----------------|--------------------|--------------------|
| Overshoot | Measured from real stick snaps | TF-2: synthetic step overshoot |
| Sluggish response | Slow rise time from steps | TF-3: bandwidth < 40 Hz |
| Ringing/oscillation | Bounce-back in individual steps | TF-1: phase margin < 45° |
| Slow settling | Settling time measurement | TF-2: settling from synthetic step |
| I-term tracking | Steady-state error from steps | DC gain proxy (Task 5) |

### What Flash Tune Cannot See (and why it's OK)

| Analysis | Why unavailable | Flash Tune alternative |
|----------|----------------|----------------------|
| Per-step variance | No individual steps | Per-band TF (Task 3) reveals throttle-dependent behavior |
| FF energy ratio | Needs step-local pidP/pidF | Header-based FF heuristics (boost, transition) |
| Cross-axis coupling | Needs step events | None — less critical, gracefully skipped |
| Ringing (bounce-back) | Synthetic response is smoothed | Phase margin detects same phenomenon from frequency domain |

### Averaging Equivalence

Deep Tune has per-step data but `PIDRecommender` works with **means** (`meanOvershoot`, `meanRiseTimeMs`). Flash Tune's Wiener deconvolution is also an average over the entire flight. Both modes produce aggregated metrics — functionally equivalent for recommendation generation.

### Confidence: Gating Replaces Blanket Cap

The original MEDIUM confidence cap was a workaround for missing D-term gating and prop wash integration. With unified post-processing, the same gating logic that protects Deep Tune (D-term effectiveness 3-tier, prop wash boost, damping ratio) protects Flash Tune. No blanket cap needed.

## Core Design Decision: Unified Pipeline

Instead of patching `analyzeTransferFunction()` with missing calls, **extract shared post-processing into a single function** that both modes use. The only mode-specific code is step extraction (how we get `AxisStepProfile`).

### Target Architecture

```typescript
// PIDAnalyzer.ts — unified pipeline

async function analyzePID(
  flightData: BlackboxFlightData,
  mode: 'step_response' | 'wiener_deconvolution',
  ...commonParams
): Promise<PIDAnalysisResult> {

  // ── MODE-SPECIFIC: Extract step response data ──
  let profiles: { roll, pitch, yaw: AxisStepProfile };
  let tfResult: TransferFunctionResult | undefined;
  let allResponses: StepResponse[] = [];
  let steps: DetectedStep[] = [];

  if (mode === 'step_response') {
    // Existing Deep Tune logic: detectSteps → computeStepResponse → aggregate
    steps = detectSteps(flightData, adaptiveWindow);
    // ... compute per-axis responses, FF energy ratio ...
    profiles = { roll: aggregated.roll, pitch: aggregated.pitch, yaw: aggregated.yaw };
    allResponses = [...rollResponses, ...pitchResponses, ...yawResponses];
  } else {
    // Existing Flash Tune logic: estimateAllAxes → build profiles from TF metrics
    tfResult = estimateAllAxes(setpoint, gyro, sampleRateHz);
    profiles = buildProfilesFromTF(tfResult);
  }

  // ── SHARED POST-PROCESSING (identical for both modes) ──

  // Data quality (mode-aware scorer)
  const qualityResult = mode === 'step_response'
    ? scorePIDDataQuality({ totalSteps, axisResponses })
    : scoreWienerDataQuality({ flightData, tfResult });

  // Analyses that work on raw flight data (available in both modes)
  const propWash = analyzePropWash(flightData);
  const dTermEffectiveness = analyzeDTermEffectiveness(flightData);
  const feedforwardContext = rawHeaders ? extractFeedforwardContext(rawHeaders) : undefined;

  // Analyses that need real step events (Deep Tune only, gracefully null for Flash)
  const crossAxisCoupling = steps.length > 0
    ? analyzeCrossAxisCoupling(steps, flightData) : undefined;
  const feedforwardAnalysis = allResponses.length > 0
    ? analyzeFeedforward(allResponses, feedforwardContext) : undefined;

  // Per-band TF analysis (Flash Tune only, gracefully null for Deep)
  const throttleTF = mode === 'wiener_deconvolution'
    ? analyzeThrottleTF(flightData, sampleRateHz) : undefined;

  // Recommendations — one call, all parameters
  const rawRecommendations = recommendPID(
    profiles.roll, profiles.pitch, profiles.yaw,
    currentPIDs, flightPIDs, feedforwardContext, flightStyle,
    mode === 'wiener_deconvolution' ? tfMetrics : undefined,
    dTermEffectiveness,
    propWash
  );

  // FF recommendations (header-based for both; energy-based only when steps exist)
  const ffRecs = recommendFeedforward(feedforwardAnalysis, feedforwardContext);
  rawRecommendations.push(...ffRecs);

  // Quality-adjusted confidence — NO blanket cap, gating handles it
  const recommendations = adjustPIDConfidenceByQuality(rawRecommendations, qualityResult.score.tier);

  // Bayesian suggestion (if history available)
  const bayesianSuggestion = historyObservations?.length >= 3
    ? suggestNextPID(historyObservations) : undefined;

  // ... build unified return object ...
}
```

### What This Eliminates

- `analyzeTransferFunction()` as a separate function — **deleted**
- Blanket `MEDIUM` confidence cap — **deleted** (gating logic in PIDRecommender handles confidence)
- All duplicated post-processing code
- Risk of future parity drift (new modules added once, work for both)

### What Stays Mode-Specific

| Concern | Step Response | Wiener Deconvolution |
|---------|-------------|----------------------|
| Step extraction | detectSteps → computeStepResponse | estimateAllAxes → build profiles |
| Data quality scorer | `scorePIDDataQuality` (step counts) | `scoreWienerDataQuality` (signal quality) |
| Cross-axis coupling | Yes (needs step events) | null (graceful skip) |
| FF energy ratio | Yes (needs per-step pidP/pidF) | null (header-only FF recs) |
| Per-band TF | null | Yes (new — Task 3) |

Everything else is shared: propWash, dTermEffectiveness, recommendPID, recommendFeedforward, quality adjustment, bayesian, sliders.

## Implementation Plan

### Task 1: Unify PIDAnalyzer into Single Pipeline ✅ (PR #203)

**Files**: `src/main/analysis/PIDAnalyzer.ts`

Refactor `analyzePID()` and `analyzeTransferFunction()` into a single function with `mode` parameter (or keep two thin wrappers that call a shared `analyzePIDCore()`).

**Option A — Single function with mode param**:
```typescript
export async function analyzePID(
  flightData: BlackboxFlightData,
  mode: 'step_response' | 'wiener_deconvolution',
  ...
): Promise<PIDAnalysisResult>
```

**Option B — Two wrappers, shared core** (less API churn):
```typescript
// Public API unchanged
export async function analyzePID(...): Promise<PIDAnalysisResult> {
  const extracted = extractViaStepResponse(flightData, ...);
  return analyzePIDCore(flightData, extracted, ...);
}
export async function analyzeTransferFunction(...): Promise<PIDAnalysisResult & { transferFunction }> {
  const extracted = extractViaWiener(flightData, ...);
  return analyzePIDCore(flightData, extracted, ...);
}

// Shared post-processing
async function analyzePIDCore(
  flightData, extracted, commonParams
): Promise<PIDAnalysisResult> { ... }
```

**Recommended**: Option B — preserves IPC handler signatures, reduces blast radius.

**Changes**:
1. Extract step detection logic into `extractViaStepResponse()` helper
2. Extract Wiener logic into `extractViaWiener()` helper
3. Move ALL post-processing (steps 3-13 from table above) into `analyzePIDCore()`
4. Delete the blanket MEDIUM confidence cap (lines 346-350)
5. Wire `scoreWienerDataQuality()` (already exists, currently unused)

**Tests**:
- Existing `PIDAnalyzer.test.ts` tests for `analyzePID()` must pass unchanged
- Existing `PIDAnalyzer.test.ts` tests for `analyzeTransferFunction()` must pass with enhanced results
- New tests: verify Flash Tune result now includes `propWash`, `dTermEffectiveness`, `dataQuality`, FF recommendations
- New test: verify no blanket confidence cap — HIGH confidence possible when gating supports it

### Task 2: Feedforward Recommendations for Flash Tune ✅ (PR #203)

**Files**: `src/main/analysis/FeedforwardAnalyzer.ts`

Now handled automatically by the unified pipeline (Task 1 calls `recommendFeedforward()` for both modes). Only need to verify `recommendFeedforward(null, feedforwardContext)` gracefully handles null analysis data and returns header-based recommendations only.

**Tests**:
- Unit test: `FeedforwardAnalyzer.test.ts` — verify `recommendFeedforward(null, context)` returns header-based recs
- Verify no crash when `feedforwardAnalysis` is null

### Task 3: Response vs Throttle (Per-Band Transfer Function)

**Files**: New `src/main/analysis/ThrottleTFAnalyzer.ts`

Inspired by Plasmatree's response-vs-throttle visualization. Bins flight data by throttle level and estimates TF per band. Reveals TPA tuning problems.

**Algorithm**:
1. Reuse `ThrottleSpectrogramAnalyzer.binByThrottle()` logic to segment data into 5-10 throttle bands
2. Per band with sufficient data (>= 2048 samples ≈ 0.5s at 4kHz):
   - Run `estimateTransferFunction()` on band's setpoint/gyro slice
   - Extract: bandwidth, overshoot, phase margin
3. Compute variance of metrics across bands
4. Flag: high variance = TPA misconfiguration or throttle-dependent instability

**Output type**:
```typescript
interface ThrottleTFResult {
  bands: ThrottleTFBand[];
  bandsWithData: number;
  metricsVariance: {
    bandwidthHz: number;     // std dev across bands
    overshootPercent: number;
    phaseMarginDeg: number;
  };
  tpaWarning?: string;  // If variance exceeds threshold
}

interface ThrottleTFBand {
  throttleMin: number;
  throttleMax: number;
  sampleCount: number;
  metrics?: TransferFunctionMetrics;  // null if insufficient data
}
```

**Integration**: Called from `analyzePIDCore()` when mode is wiener. Included in result. Optional — gracefully skipped if throttle data insufficient.

**Tests**:
- Unit test: `ThrottleTFAnalyzer.test.ts` — test binning, per-band TF, variance calculation
- Unit test: test with uniform response (low variance) vs throttle-dependent response (high variance)
- Unit test: test graceful skip when insufficient throttle coverage

### Task 4: Unified Quality Score — Add TF Components ✅ (PR #204)

**Files**: `src/shared/utils/tuneQualityScore.ts`

Current Flash Tune scores use only 2-3 components (Noise Floor, Overshoot, optional Noise Delta). Deep Tune uses 4-5. This structural imbalance makes Flash scores less granular.

**Add new components sourced from TF metrics**:

```typescript
// New component: Phase Margin (stability indicator)
{
  label: 'Phase Margin',
  getValue: (_f, _p, _v, tf) => {
    if (!tf) return undefined;
    return (tf.roll.phaseMarginDeg + tf.pitch.phaseMarginDeg + tf.yaw.phaseMarginDeg) / 3;
  },
  best: 60,   // 60° = very stable
  worst: 20,  // 20° = near instability
},

// New component: Bandwidth (responsiveness indicator)
{
  label: 'Bandwidth',
  getValue: (_f, _p, _v, tf) => {
    if (!tf) return undefined;
    return (tf.roll.bandwidthHz + tf.pitch.bandwidthHz + tf.yaw.bandwidthHz) / 3;
  },
  best: 80,   // 80 Hz = fast response
  worst: 20,  // 20 Hz = sluggish
},
```

**Result**: Flash Tune scores use 4-5 components (Noise Floor, Overshoot, Phase Margin, Bandwidth, optional Noise Delta) — matching Deep Tune's granularity with TF-native metrics instead of step-response metrics.

**Scoring parity across mixed history**:
- Deep Tune: Noise Floor + Tracking RMS + Overshoot + Settling Time + [Noise Delta]
- Flash Tune: Noise Floor + Overshoot (TF) + Phase Margin + Bandwidth + [Noise Delta]
- Both produce 4-5 component scores on a 0-100 scale
- `QualityTrendChart` already handles mixed types — no chart changes needed
- Component breakdown tooltip naturally shows different component names per session type

**Tests**:
- Unit test: `tuneQualityScore.test.ts` — test Flash Tune with new TF components
- Unit test: verify component count parity (4-5 for both types)
- Unit test: verify mixed-type history produces valid trend data

### Task 5: I-Term Approximation from Transfer Function ✅ (PR #204)

**Files**: `src/main/analysis/TransferFunctionEstimator.ts`, `src/main/analysis/PIDRecommender.ts`

Deep Tune I-term rules use `meanSteadyStateError` from step responses. For TF, we can approximate from DC gain:

- **DC gain < 1.0** (magnitude[0] < 0 dB): System doesn't fully track setpoint → I-term too low
- **DC gain ≈ 1.0** (magnitude[0] ≈ 0 dB): Good I-term tracking

Add to `TransferFunctionMetrics`:
```typescript
dcGainDb: number;
steadyStateProxy: number;  // 0 = perfect, 1 = poor
```

Map DC gain deficit to approximate steady-state error in `PIDRecommender` TF path.

**Tests**:
- Unit test: `TransferFunctionEstimator.test.ts` — verify DC gain extraction
- Unit test: `PIDRecommender.test.ts` — verify I-term rec from TF DC gain deficit

### Task 6: Update Demo Data Generator ✅ (PR #204)

**Files**: `src/main/demo/DemoDataGenerator.ts`, `src/main/demo/DemoDataGenerator.test.ts`

**Changes to `generateFlashDemoBBL(cycle)`**:
1. **PropWash injection**: Add 3-4 throttle punch-down events with decaying 45 Hz oscillation (copy from `generateFilterDemoBBL`)
2. **Throttle variation**: Add throttle ramps for per-band TF analysis (current broadband setpoint uses near-fixed throttle)
3. **D-term data**: Ensure `pidD` channels generated with realistic values for `analyzeDTermEffectiveness`

**Changes to `generateFlashVerificationDemoBBL(cycle)`**:
- Same updates with lower prop wash severity (post-tune improvement)

**Progression**:
- Cycle 0: High prop wash, low D-term effectiveness, wide TF bandwidth variance
- Cycle 4: Low prop wash, high D-term effectiveness, stable TF across throttle

**Tests**:
- Update `DemoDataGenerator.test.ts` — verify flash BBL includes throttle variation and prop wash
- Verify `analyzePropWash()` returns non-null on flash demo data
- Verify `analyzeDTermEffectiveness()` returns non-null on flash demo data

### Task 7: Update Tuning History Types and Archival

**Files**: `src/shared/types/tuning-history.types.ts`, `src/shared/utils/metricsExtract.ts`

Add optional fields to `TransferFunctionMetricsSummary`:
```typescript
throttleBands?: {
  bandsWithData: number;
  metricsVariance: { bandwidthHz: number; overshootPercent: number; phaseMarginDeg: number };
  tpaWarning?: string;
};
dcGain?: { roll: number; pitch: number; yaw: number };
```

All new fields optional — existing history records parse without issue.

**Tests**:
- Unit test: `metricsExtract.test.ts` — verify new fields extracted
- Unit test: verify old records without new fields still load

### Task 8: Update E2E Tests and History Generator

**Files**: `e2e/demo-quick-tune-cycle.spec.ts`, `e2e/demo-generate-history.spec.ts`

**IPC handler update**: `ANALYSIS_RUN_TRANSFER_FUNCTION` in `analysisHandlers.ts` may need signature adjustment if `analyzeTransferFunction()` wrapper changes. Verify handler still works.

**E2E Quick Tune cycle**:
- No flow changes expected (new analyses are automatic)
- Verify quality score badge appears with reasonable value

**E2E History Generator**:
- Verify mixed sessions produce comparable score ranges
- All 5 sessions visible in trend chart

**Regression**: Full E2E suite must pass.

### Task 9: Update Documentation

**Files to update**:

1. **CLAUDE.md**: Update PIDAnalyzer section (unified pipeline), remove confidence cap mention, add per-band TF, DC gain
2. **ARCHITECTURE.md**: Update analysis module descriptions, test counts
3. **TESTING.md**: Add new test files and counts
4. **SPEC.md**: Update test count and PR range
5. **README.md**: Update test count if changed
6. **docs/README.md**: Add this doc to index, update status when complete
7. **docs/QUICK_TUNE_WIENER_DECONVOLUTION.md**: Reference this doc

## Task Dependency Graph

```
Task 1 (Unified pipeline + confidence cap removal) ──┐
Task 2 (FF null handling)                             ├──→ Task 4 (Quality score)
Task 5 (I-term from DC gain) ────────────────────────┘         │
                                                                ▼
Task 3 (Per-band TF) ──────────────────────────────────→ Task 7 (History types)
                                                                │
Task 6 (Demo data) ────────────────────────────────────→ Task 8 (E2E tests)
                                                                │
                                                         Task 9 (Documentation)
```

**Suggested PR sequence**:
1. **PR A**: Tasks 1 + 2 — Unified pipeline (core refactor, all shared analyses, FF null handling, confidence cap removal)
2. **PR B**: Task 5 — I-term from DC gain
3. **PR C**: Task 3 — Per-band TF analyzer (new module)
4. **PR D**: Tasks 4 + 7 — Quality score parity + history types
5. **PR E**: Tasks 6 + 8 — Demo data + E2E
6. **PR F**: Task 9 — Documentation

## Risk Assessment

### Low Risk
- **Task 2**: Null-guard check in existing function.
- **Task 7**: Optional fields in types. Full backward compatibility.
- **Task 9**: Documentation only.

### Medium Risk
- **Task 1**: Refactoring two functions into shared core. Mitigated by: keeping public API wrappers unchanged (Option B), extensive existing test coverage. This is the most important task — everything else builds on it.
- **Task 4**: Changing quality score components for Flash Tune. Old history unaffected. Verify score ranges.
- **Task 6**: Demo data changes must produce valid BBL. E2E regression catches issues.

### Higher Risk
- **Task 3**: New module. Per-band TF with small windows may be noisy. Robust thresholds + graceful skip.
- **Task 5**: I-term heuristic from DC gain. Conservative thresholds mitigate.

## Success Criteria

1. Single `analyzePIDCore()` handles both Deep and Flash Tune post-processing
2. `analyzeTransferFunction()` is a thin wrapper, not a parallel implementation
3. No blanket confidence cap — gating logic handles confidence for both modes
4. Flash Tune returns `propWash`, `dTermEffectiveness`, FF recs, data quality, bayesian suggestion
5. Quality score uses 4-5 components for both modes with comparable ranges
6. Mixed Deep/Flash history produces smooth `QualityTrendChart`
7. All existing tests pass without modification (public API preserved)
8. Per-band TF detects TPA misconfiguration in demo data
9. Demo data exercises all new Flash Tune analysis paths
