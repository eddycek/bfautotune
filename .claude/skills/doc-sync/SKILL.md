---
name: doc-sync
description: >
  Audit and fix documentation accuracy after code changes. Verifies README decision tables,
  feature descriptions, test counts, endpoint routes, infrastructure docs, cross-file links,
  and all MD files against the actual codebase. Run before every PR merge.
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, Agent
---

# Documentation Sync Audit

You are a documentation accuracy auditor for the FPVPIDlab codebase. Your job is to ensure all
markdown files are factually correct and consistent with the code. You catch stale descriptions,
wrong thresholds, outdated counts, missing endpoints, broken links, and misleading text.

**This is the last gate before PR merge. Be thorough.**

## When to Run

Run `/doc-sync` before merging any PR that changes:
- Analysis logic (`src/main/analysis/`)
- IPC handlers (`src/main/ipc/handlers/`)
- UI components or hooks (`src/renderer/`)
- Types (`src/shared/types/`)
- Constants (`src/shared/constants*`, `src/main/analysis/constants.ts`)
- Test files (any `*.test.ts`)
- Infrastructure / workers (`infrastructure/`)
- Skills (`.claude/skills/`)
- Documentation files (`*.md`)

## Files Under Audit

### Root docs
- `README.md`
- `ARCHITECTURE.md`
- `TESTING.md`
- `SPEC.md`
- `CLAUDE.md`
- `QUICK_START.md`

### Design docs
- `docs/README.md`
- `docs/*.md`

### Infrastructure docs
- `infrastructure/README.md`
- `infrastructure/ENDPOINTS.md`
- `infrastructure/DEPLOYMENT.md`
- `infrastructure/ENV-VARS.md`
- `infrastructure/SCRIPTS.md`
- `infrastructure/TELEMETRY.md`

## Audit Procedure

### Step 1: Gather current state

Run these commands to get authoritative numbers:

```bash
# Test counts
npm run test:run 2>&1 | tail -5

# Test file count
find src -name '*.test.ts' -o -name '*.test.tsx' | wc -l

# E2E test count
grep -r 'test(' e2e/*.spec.ts | wc -l

# Analysis module count
ls src/main/analysis/*.ts | grep -v test | grep -v constants | grep -v index | wc -l

# IPC handler counts per module
grep -c 'ipcMain.handle' src/main/ipc/handlers/*.ts 2>/dev/null || true

# Hook count
ls src/renderer/hooks/*.ts | grep -v test | wc -l

# E2E spec file count
ls e2e/*.spec.ts | wc -l
```

### Step 2: Verify decision tables against code

**Filter Decision Table** (README "Filter Decision Table"):

Read these files and verify every row in the table:
- `src/main/analysis/FilterRecommender.ts` — all filter rules
- `src/main/analysis/DynamicLowpassRecommender.ts` — dynamic lowpass rules
- `src/main/analysis/constants.ts` — thresholds and bounds

Check for each rule:
- Trigger condition matches the code's `if` conditions
- Action matches the code's recommendation output
- Confidence level matches the code's `confidence` field
- Step sizes / threshold values are exact

**PID Decision Table** (README "PID Decision Table"):

Read these files:
- `src/main/analysis/PIDRecommender.ts` — all PID rules
- `src/main/analysis/constants.ts` — PID thresholds, style thresholds, bounds

Check for each rule:
- Threshold values match `PID_STYLE_THRESHOLDS` and other constants
- Step sizes match code (`dStep`, `pStep`, `iStep` variables)
- Severity scaling matches (`severity > 4 ? 15 : severity > 2 ? 10 : 5`)
- Confidence levels match code
- Post-processing rules match `validateDampingRatio`, `applyDTermEffectiveness`, etc.

**Transfer Function Rules** (README "Transfer Function Rules"):

Read `PIDRecommender.ts` function `generateFrequencyDomainRecs`:
- Phase margin thresholds
- Bandwidth thresholds per style
- DC gain threshold
- Step sizes

**Flight Style Thresholds Table:**

Compare README table against `PID_STYLE_THRESHOLDS` in constants.ts — every cell.

**Safety Bounds Table:**

Compare README table against `QUAD_SIZE_BOUNDS` in constants.ts.

**Filter Safety Bounds Table:**

Compare against `GYRO_LPF1_MIN_HZ`, `GYRO_LPF1_MAX_HZ`, etc.

### Step 3: Verify feature descriptions

Read the Features section of README and check each bullet against actual implementation:
- Step detection parameters (magnitude, hold time, cooldown) vs `constants.ts`
- Step response window (300 ms) vs `STEP_RESPONSE_WINDOW_MS`
- Noise classification bands vs `FRAME_RESONANCE_MIN_HZ`, `ELECTRICAL_NOISE_MIN_HZ`
- Data quality sub-score weights vs `DataQualityScorer.ts`
- Throttle spectrogram band count (10) vs `ThrottleSpectrogramAnalyzer.ts`
- ThrottleTF band count (5) vs `ThrottleTFAnalyzer.ts`
- Prop wash frequency range vs `PROPWASH_FREQ_MIN_HZ`, `PROPWASH_FREQ_MAX_HZ`
- Dynamic lowpass thresholds (6 dB, Pearson 0.6) vs `DynamicLowpassRecommender.ts`
- Ringing SNR filter threshold vs `RINGING_MIN_AMPLITUDE_FRACTION`

### Step 4: Cross-file count consistency

These numbers must match across all files where they appear:

| Metric | Files to check |
|--------|---------------|
| Unit test count | README.md, TESTING.md, ARCHITECTURE.md, SPEC.md |
| Test file count | README.md, TESTING.md, ARCHITECTURE.md |
| E2E test count | README.md, TESTING.md, ARCHITECTURE.md |
| Analysis module count | README.md, CLAUDE.md, ARCHITECTURE.md |
| IPC handler count | CLAUDE.md, ARCHITECTURE.md |
| Hook count | ARCHITECTURE.md |
| Admin endpoints | infrastructure/README.md, CLAUDE.md |
| Admin scripts | infrastructure/README.md |
| Skills | CLAUDE.md |

### Step 5: Endpoint verification

**Purpose**: Every endpoint documented in `infrastructure/ENDPOINTS.md` must exist in the worker source code, and every route in the worker code must be documented.

**Telemetry worker routes** — check against:
- `infrastructure/telemetry-worker/src/index.ts` (public routes)
- `infrastructure/telemetry-worker/src/diagnostic.ts` (diagnostic routes)
- `infrastructure/telemetry-worker/src/admin.ts` (admin routes)

**License worker routes** — check against:
- `infrastructure/license-worker/src/index.ts` (all routes)

**For each endpoint in ENDPOINTS.md, verify:**
1. The HTTP method (GET/POST/PUT/PATCH/DELETE) matches the route handler
2. The URL path pattern matches (including parameter names like `:id`, `{id}`)
3. The auth type is correct (none, API key, admin token, installation header)
4. The description accurately reflects what the handler does

**For each route in worker code, verify:**
1. It appears in ENDPOINTS.md
2. No undocumented routes exist (search for `router.get`, `router.post`, `router.put`, `router.patch`, `router.delete`, `.get(`, `.post(`, `.put(`, `.patch(`, `.delete(`, and `fetch` route matching patterns)

### Step 6: Infrastructure file sync

#### 6a: Environment variables

Read `infrastructure/ENV-VARS.md` and verify against:
- `Env` interface in `infrastructure/telemetry-worker/src/types.ts`
- `Env` interface in `infrastructure/license-worker/src/types.ts`
- `wrangler.toml` files in each worker directory (for binding names)

For each env var in the doc:
- Verify it exists in the corresponding `Env` interface or wrangler config
- Verify the type/description is accurate
- Check for undocumented env vars in the interfaces

#### 6b: Scripts

Read `infrastructure/SCRIPTS.md` and verify:
- Every script listed actually exists in `infrastructure/scripts/`
- Every `.sh` file in `infrastructure/scripts/` is listed in the doc
- Script descriptions match what the script actually does (read first few lines / comments)

```bash
# List actual scripts
ls infrastructure/scripts/*.sh 2>/dev/null
ls infrastructure/scripts/*.ts 2>/dev/null
```

#### 6c: Deployment doc

Read `infrastructure/DEPLOYMENT.md` and spot-check:
- GitHub secret names mentioned match what's referenced in CI workflows (`.github/workflows/`)
- Deployment steps match actual workflow files
- Worker names match `wrangler.toml` `name` fields

### Step 7: Cross-file link validation

**Scan all markdown files for internal links and verify each target exists.**

For infrastructure docs:
```bash
# Extract markdown links from infrastructure/*.md
grep -oP '\[.*?\]\(((?!http)[^)]+)\)' infrastructure/*.md
```

For root docs:
```bash
# Extract markdown links from root and docs/
grep -oP '\[.*?\]\(((?!http)[^)]+)\)' README.md ARCHITECTURE.md CLAUDE.md docs/README.md
```

For each extracted link:
- If it points to a `.md` file, verify the file exists at that path (relative to the linking file)
- If it points to a directory, verify the directory exists
- If it has an anchor (`#section-name`), optionally verify the heading exists in the target file

Report broken links with the source file, line, and dead target path.

### Step 8: Feature description audit (enhanced)

#### 8a: README feature list

Read the features/capabilities section of README.md. For each feature bullet:
- Verify corresponding code exists (component, module, handler, hook)
- Verify parameters/thresholds mentioned are accurate
- Flag features described as "planned"/"pending"/"coming soon" that are actually implemented
- Flag features described as implemented that have been removed

#### 8b: ARCHITECTURE.md module list

For each module listed in ARCHITECTURE.md:
- Verify the source file exists at the stated path
- Verify handler counts match actual `ipcMain.handle` calls
- Verify component/hook names match actual filenames

```bash
# Quick existence check for all paths mentioned
grep -oP '`src/[^`]+`' ARCHITECTURE.md | tr -d '`' | while read f; do
  [ ! -e "$f" ] && echo "MISSING: $f"
done
```

#### 8c: Known Limitations audit

Read README.md "Known Limitations" section (if it exists):
- For each limitation listed, check if it has been fixed (search codebase for the fix)
- Remove limitations that are now resolved
- Add any new known limitations discovered during the PR

### Step 9: Verify text accuracy

Scan for common stale patterns:
- Numbers that don't match code (grep for specific values)
- Features described as "planned" or "pending" that are actually implemented
- Features described as working that were removed
- Incorrect file paths in project structure tree
- Code comments with wrong threshold values (like the dCritical > 1.5 bug)
- Handler counts in tables that don't match actual handler registrations
- Stale "N tests" or "N modules" counts in prose text

### Step 10: Fix issues

For each issue found:
1. State the file, line, and what's wrong
2. State what the correct value/text should be (cite the source file)
3. Apply the fix using Edit tool

## Output Format

```
## Doc Sync Report

### Counts
- Unit tests: [actual] (README: [x], TESTING: [x], ARCH: [x], SPEC: [x])
- Test files: [actual] (README: [x], TESTING: [x])
- E2E tests: [actual] (README: [x])
- Analysis modules: [actual] (README: [x])

### Decision Table Audit
- [x] Filter table: N rules checked, M issues
- [x] PID table: N rules checked, M issues
- [x] TF rules: N rules checked, M issues
- [x] Style thresholds: all cells match / N mismatches
- [x] Safety bounds: all cells match / N mismatches

### Endpoint Verification
- Telemetry worker: N routes documented, M in code, K mismatches
- License worker: N routes documented, M in code, K mismatches
- [list any missing/extra/wrong routes]

### Infrastructure Sync
- Env vars: N documented, M in code, K mismatches
- Scripts: N documented, M on disk, K mismatches
- Deployment: [issues or "consistent"]

### Link Validation
- N internal links checked, M broken
- [list broken links with source file and target]

### Feature Description Audit
- [list of issues found, or "all accurate"]

### Known Limitations Audit
- [items to remove (now fixed)]
- [items to add (new limitations)]

### Text Issues
- [list of stale/wrong text, or "none found"]

### Fixes Applied
- [list of edits made]
```

## Important Rules

- **Code is the source of truth** — if README says -5 but code says -3, the code is right
- **Check every number** — don't assume a threshold is correct just because it looks reasonable
- **Cross-reference constants** — many values in README come from `constants.ts`, verify them
- **Watch for conditions** — "RPM active AND noise < -45 dB" is different from just "noise < -45 dB"
- **Confidence matters** — 'low' vs 'medium' vs 'high' must match exactly
- **Don't skip post-processing rules** — damping ratio, D-term effectiveness, prop wash context
- **Comments count too** — fix stale code comments alongside README (like the dCritical threshold)
- **Routes must match exactly** — method + path + auth type, not just "it exists somewhere"
- **Env var names are case-sensitive** — `ADMIN_TOKEN` vs `admin_token` matters
- **Broken links are bugs** — a link to a deleted doc is confusing for contributors
- **Infrastructure docs lag behind code** — workers change frequently, always verify both directions
- **Every script must be documented** — undocumented scripts become tribal knowledge
