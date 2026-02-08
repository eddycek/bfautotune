# FPV Drone Autotuning App for Betaflight

## Design Specification

**Source:** `fpv-betaflight-autotune-spec.pdf`
**Generated:** 2026-01-29
**Tracking added:** 2026-02-08

> This file is the authoritative project specification. Each requirement is annotated with its implementation status. Use this to validate that the project is progressing against the original design.

### Status Legend

| Icon | Meaning |
|------|---------|
| :white_check_mark: | Implemented and tested |
| :construction: | Partially implemented / in progress |
| :x: | Not yet started |
| :fast_forward: | Deferred (post-MVP / future) |

---

## 1. Introduction

Tuning an FPV drone's flight controller is overwhelming for many pilots, especially beginners. Betaflight exposes powerful tuning controls (PIDs, filters), but optimizing them requires interpreting Blackbox logs. This document specifies an application that guides users end-to-end: connect the drone over USB, perform guided test flights, collect Blackbox logs, analyze them, apply tuning changes, and explain every change in beginner-friendly terms.

Primary focus: filter tuning (noise vs latency) and PID tuning (step response). The app must support configuration versioning (snapshots), comparisons, and rollback. AI is optional in MVP; the tuning engine must be deterministic (rules/metrics) and work offline.

---

## 2. Objectives

| # | Objective | Status |
|---|-----------|--------|
| 1 | Automated filter tuning from Blackbox (noise spectrum, resonance detection, safe reduction of filtering for lower latency) | :white_check_mark: Analysis engine complete (PR #5). Apply-to-FC pending. |
| 2 | Automated PID tuning from Blackbox (P/D balance and master gain using step response metrics) | :white_check_mark: Analysis engine complete (PR #6). Apply-to-FC pending. |
| 3 | Beginner-first UX: wizard flow + clear explanations + safety checks | :construction: Wizard UI in progress (feature/tuning-wizard). Flight guide + step progress done. Results display pending. |
| 4 | Full local workflow: USB connect, log download/import, analysis, apply settings | :construction: Connect + download + parse + filter analysis + PID analysis done. Wizard in progress. Apply pending. |
| 5 | Configuration versioning: snapshots, rollback, labeling, export/import | :white_check_mark: Phase 1 complete |
| 6 | Cross-platform: Windows/macOS/Linux | :construction: Code is cross-platform. Builds not yet tested on all platforms. |
| 7 | Minimal cloud dependencies; optional AI via user-supplied API key | :white_check_mark: Fully offline. AI not yet integrated (future). |

---

## 3. Target Users

**Primary users:** FPV pilots with limited tuning knowledge who want a responsive, stable tune without manual graph reading.

**Secondary users:** Experienced tuners who want a fast, repeatable workflow, quick comparisons, and safe rollback.

> **Implementation note:** Beginner-friendly explanations are built into FilterRecommender `reason` strings. Wizard UI (Task #19) will surface these.

---

## 4. Workflow Overview

High-level user journey:

| Step | Description | Status |
|------|-------------|--------|
| 1 | Connect drone over USB; read Betaflight version/target; create baseline backup snapshot | :white_check_mark: MSP connect + FC info + auto-baseline snapshot |
| 2 | Configure Blackbox logging for analysis (high logging rate, correct debug mode); ensure prerequisite settings | :construction: Blackbox info read works. Auto-configure logging rate not yet implemented. |
| 3 | Filter tuning: guided throttle-sweep test flight; retrieve log; run noise analysis; propose safe filter adjustments; apply | :construction: Retrieve log :white_check_mark:, parse :white_check_mark:, noise analysis :white_check_mark:, recommendations :white_check_mark:. Guided flight instructions :x:, apply to FC :x:. |
| 4 | PID tuning: guided short test flights for P/D balance (vary D slider) and overall gain (master multiplier); retrieve logs; analyze; apply | :construction: Step response analysis :white_check_mark: (PR #6). Guided flight instructions :white_check_mark:. Apply to FC :x:. |
| 5 | Restore other parameters (FeedForward, I, dynamic damping if used); store tuned snapshot; test-fly; rollback if needed | :x: Task #20 |

---

## 5. Functional Requirements: Drone Connection

| Requirement | Status | Notes |
|-------------|--------|-------|
| Detect Betaflight FC via USB serial | :white_check_mark: | MSPConnection with vendor ID filtering + fallback |
| Communicate via MSP to read/write settings and retrieve logs | :white_check_mark: | MSPClient with retry logic, MSPProtocol encoder/decoder |
| Handle reconnects and FC reboots after save | :white_check_mark: | 3s cooldown, 1s backend delay, auto port rescan |
| Support exporting config as CLI diff/dump and importing for restore | :white_check_mark: | `exportCLI('diff'\|'dump')` via MSP CLI mode |

---

## 6. Functional Requirements: Blackbox Logs

| Requirement | Status | Notes |
|-------------|--------|-------|
| Import .bbl/.bfl files and/or download logs from onboard flash via MSP | :white_check_mark: | MSP_DATAFLASH_READ download + BlackboxManager storage |
| Parse raw gyro and relevant channels (setpoint/gyro tracking) for analysis | :white_check_mark: | BlackboxParser: gyro, setpoint, PID, motor, debug as Float64Array (171 tests) |
| Load multiple logs for comparative analysis (e.g., D sweep flights) | :construction: | Single-log analysis works. Multi-log comparison UI not built yet. |
| Ensure performance: large logs, FFT, and metric computation must not freeze UI | :white_check_mark: | Async parsing with progress events, FFT with event loop yielding, Welch averaging <200ms |

---

## 7. Functional Requirements: Filter Tuning

| Requirement | Status | Notes |
|-------------|--------|-------|
| Compute gyro noise spectrum (FFT) over steady segments (exclude takeoff/landing) | :white_check_mark: | SegmentSelector + FFTCompute (Welch's method, Hanning window) |
| Detect peaks (frame resonance, motor harmonics) and overall noise floor | :white_check_mark: | NoiseAnalyzer: prominence-based peaks, 3 classification types, quartile noise floor |
| Decide adjustments: dynamic notch, RPM filtering validation, gyro/D-term lowpass cutoff changes, safety bounds | :construction: | Dynamic notch range + gyro/D-term LPF done. RPM filtering validation not yet implemented. |
| Prefer minimal filtering compatible with safe noise levels to minimize latency | :white_check_mark: | Low noise -> raise cutoffs for less latency; safety bounds enforced |
| Provide plain-English explanation per change + optional advanced graph view | :construction: | Plain-English explanations :white_check_mark: (FilterRecommender `reason`). Graph view :x: (needs UI). |
| Apply changes to FC and save; auto-snapshot new config | :x: | Task #20 |

---

## 8. Functional Requirements: PID Tuning

| Requirement | Status | Notes |
|-------------|--------|-------|
| P/D balance step: temporarily set FF=0, dynamic damping=0, reduce I; run guided D sweep flights; compute step responses; select best D setting via overshoot/latency/ringing scoring | :construction: | Step detection + metrics + scoring done (PR #6). D sweep multi-log comparison not yet built. |
| Master gain step: scale P/D together; detect onset of oscillation or instability; select highest stable multiplier with margin | :x: | Task #20 |
| Restore and tune secondary parameters (FF, I, anti-gravity, etc.) using safe defaults and simple metrics | :x: | Task #20 |
| Write final PIDs to FC; save; snapshot + diff vs previous | :x: | Task #20 (MSP write infrastructure exists via PID_UPDATE_CONFIG) |

---

## 9. UX Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| Wizard flow with progress (Setup -> Filter -> PID -> Results) | :construction: | Wizard UI with 5-step progress bar (Guide → Session → Filter → PID → Summary). feature/tuning-wizard branch. |
| Beginner language; tooltips for terms; advanced details toggle | :construction: | Recommendation reasons are beginner-friendly. Flight guide with phases and tips done. UI tooltips not yet built. |
| Clear flight instructions with checklists and visual hints | :construction: | FlightGuideContent with 6 phases + 5 tips. TuningWorkflowModal for preparation. Visual diagrams pending. |
| Robust error handling: inconclusive logs, missing data, parsing errors | :white_check_mark: | Parser corruption recovery, analysis fallback to full flight, IPC error responses |
| Profiles/History screen: list snapshots, compare, restore, export/import | :construction: | Snapshot list + delete + export :white_check_mark:. Compare (diff view) :x:. |

---

## 10. Platform and Technology Choice

| Decision | Status | Implementation |
|----------|--------|----------------|
| Cross-platform desktop app for reliable USB serial, offline operation, and local file handling | :white_check_mark: | Electron (Node.js + Chromium) chosen |
| Electron (Node.js + Chromium): fastest ecosystem, mature JS tooling | :white_check_mark: | Electron 28 + Vite + TypeScript + React |
| Tauri (Rust backend + WebView): smaller binaries and lower RAM | :fast_forward: | Not chosen for MVP. May revisit post-v1. |
| Keep analysis engine modular so it can later run as a Kubernetes service | :white_check_mark: | Analysis modules are pure functions (input -> output), no Electron dependencies |

---

## 11. Architecture Proposal

### Core Modules

| Module | Spec Name | Status | Implementation |
|--------|-----------|--------|----------------|
| UI | React + chart library | :construction: | React :white_check_mark:. Chart library not yet added (needed for spectrum graphs). |
| Backend | Electron Node process with serial/MSP + analysis workers | :white_check_mark: | Main process with MSPClient, managers, IPC handlers |
| `msp-client` | connect, read/write settings, reboot, log download | :white_check_mark: | `src/main/msp/` — MSPProtocol, MSPConnection, MSPClient |
| `config-vcs` | snapshots, diffs, rollback, export/import | :white_check_mark: | `src/main/storage/SnapshotManager.ts` + ProfileManager |
| `blackbox-parser` | decode logs | :white_check_mark: | `src/main/blackbox/` — 6 modules, 171 tests |
| `analysis-filter` | FFT, noise floor, peaks, filter recommendations | :white_check_mark: | `src/main/analysis/` — 5 modules, 91 tests |
| `analysis-pid` | step response extraction, scoring, recommendations | :white_check_mark: | `src/main/analysis/` — StepDetector, StepMetrics, PIDRecommender, PIDAnalyzer (58 tests) |
| `tuning-orchestrator` | state machine + safety constraints | :x: | Task #20 |
| `ui-wizard` | screens + explanations + charts | :construction: | `src/renderer/components/TuningWizard/` — 5-step wizard, flight guide, progress bar. Charts pending. |

### Persistence

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Local folder or SQLite; store snapshots as JSON + CLI diff | :white_check_mark: | File-based JSON in `{userData}/data/` — profiles, snapshots, blackbox-logs |

---

## 12. Kubernetes Readiness (Future)

| Requirement | Status | Notes |
|-------------|--------|-------|
| Package analysis engine as a stateless service (container) that accepts logs + baseline config and returns recommended diffs | :fast_forward: | Architecture supports this — analysis modules are pure functions |
| Keep core algorithms pure and testable (input -> output) | :white_check_mark: | All analysis modules: pure TypeScript, no side effects, 149 tests (91 filter + 58 PID) |
| Cloud optional; local remains primary | :white_check_mark: | Fully offline, no network calls |

---

## 13. Business and Product Strategy

| Consideration | Status | Notes |
|---------------|--------|-------|
| Market pain is real: many pilots struggle with tuning and understanding Blackbox graphs | N/A | Validated by spec |
| Differentiator: end-to-end guided workflow + automated recommendations + rollback + beginner explanations | :construction: | Core engine built. Guided workflow UI pending. |
| Monetization paths (later): open-core or freemium (AI assistant, cloud analysis, sync), or B2B licensing | :fast_forward: | Post-MVP |
| MVP should be fully usable offline without accounts | :white_check_mark: | No accounts, no network, fully local |

---

## 14. MVP Deliverables

| Deliverable | Status | Notes |
|-------------|--------|-------|
| Cross-platform desktop app (Win/macOS/Linux) | :construction: | Electron app runs. Cross-platform builds not tested. |
| USB connect + read/write Betaflight settings via MSP | :white_check_mark: | Phase 1 complete |
| Snapshot/versioning with rollback | :white_check_mark: | Phase 1 complete |
| Blackbox log import/download + parsing | :white_check_mark: | PR #2-4 complete |
| Filter analysis + apply changes | :construction: | Analysis :white_check_mark: (PR #5). Apply to FC :x:. |
| PID analysis (P/D + master gain) + apply changes | :construction: | Analysis :white_check_mark: (PR #6). Apply to FC :x:. |
| Guided tutorial screens for required test flights | :construction: | Wizard UI with flight guide :white_check_mark:. Visual aids :x:. |
| Export session report (PDF/HTML) summarizing changes | :fast_forward: | Optional in MVP, recommended for v1.1 |

---

## 15. References

Reference sources to consult during implementation (non-exhaustive):

- Betaflight documentation: Blackbox, MSP protocol, Configurator
- Betaflight Blackbox Log Viewer source code (parsing and plotting)
- PIDtoolbox wiki / step response methodology
- Oscar Liang: Blackbox tuning guides and throttle sweep methodology
- Open-source parsers: orangebox (Python), bbl_parser (Rust)
- @betaflight/api (JS) or equivalent MSP libraries
- Tauri performance/size comparisons vs Electron

---

## Progress Summary

| Area | Completion |
|------|------------|
| Drone Connection (Section 5) | **100%** |
| Blackbox Logs (Section 6) | **90%** (multi-log compare missing) |
| Filter Tuning (Section 7) | **75%** (analysis done, apply + RPM validation + graph UI missing) |
| PID Tuning (Section 8) | **60%** (step response analysis done, D sweep multi-log + master gain + apply missing) |
| UX / Wizard (Section 9) | **55%** (wizard flow + flight guide + progress done, results display + visual aids missing) |
| Architecture (Section 11) | **85%** (6/7 core modules built, tuning-orchestrator pending) |
| MVP Deliverables (Section 14) | **~70%** (4/8 fully done, 3 partial, 1 not started) |
