# Documentation Index

Overview of all design documents in this directory. Each document starts as a design proposal and becomes an implementation record once the feature is merged.

## Document Status

| Document | Status | PRs | Description |
|----------|--------|-----|-------------|
| [BBL_PARSER_VALIDATION](./BBL_PARSER_VALIDATION.md) | **Complete** | #2–#10 | Byte-exact validation of BBL parser against BF Explorer reference implementations |
| [BF_VERSION_POLICY](./BF_VERSION_POLICY.md) | **Complete** | #79 | Betaflight version compatibility policy (min 4.3, recommended 4.5+) |
| [COMPREHENSIVE_TESTING_PLAN](./COMPREHENSIVE_TESTING_PLAN.md) | **Complete** | #84–#88 | 9-phase testing plan: 1903 tests / 97 files |
| [FEEDFORWARD_AWARENESS](./FEEDFORWARD_AWARENESS.md) | **Complete** | #55–#62 | FF detection from BBL headers, FF-dominated overshoot classification, FF-aware PID recommendations, MSP read, FC info display |
| [FLIGHT_STYLE_PROFILES](./FLIGHT_STYLE_PROFILES.md) | **Complete** | #71–#78 | Smooth/Balanced/Aggressive flight style selector, style-based PID thresholds, preset defaults |
| [RPM_FILTER_AWARENESS](./RPM_FILTER_AWARENESS.md) | **Complete** | #63–#69 | RPM filter detection via MSP/BBL, RPM-aware filter bounds, dynamic notch optimization, motor harmonic diagnostics |
| [TUNING_WORKFLOW_REVISION](./TUNING_WORKFLOW_REVISION.md) | **Complete** | #31–#50 | Stateful two-flight tuning workflow design (10-phase state machine) |
| [TUNING_WORKFLOW_FIXES](./TUNING_WORKFLOW_FIXES.md) | **Complete** | #42–#43 | Fix for download/analyze being blocked during tuning session + phase transition after apply |
| [TUNING_HISTORY_AND_COMPARISON](./TUNING_HISTORY_AND_COMPARISON.md) | **Complete** | #96–#99 | Tuning session history + before/after comparison on completion (UX #3 + #6) |
| [SD_CARD_BLACKBOX_SUPPORT](./SD_CARD_BLACKBOX_SUPPORT.md) | **Complete** | #105, #142 | SD card blackbox storage support via MSC mode + tuning session fixes |
| [PROPWASH_AND_DTERM_DIAGNOSTICS](./PROPWASH_AND_DTERM_DIAGNOSTICS.md) | **Proposed** | — | Prop wash event detection + D-term noise-to-effectiveness ratio diagnostics |
| [TUNING_PRECISION_IMPROVEMENTS](./TUNING_PRECISION_IMPROVEMENTS.md) | **Active** | #119–#120, #137 | Research-based tuning accuracy improvements: Wiener deconvolution, throttle spectrograms, ~~proportional PID scaling~~ (done), ~~data quality scoring~~ (done), ~~flight quality score~~ (done), chirp analysis |
| [UX_IMPROVEMENT_IDEAS](./UX_IMPROVEMENT_IDEAS.md) | **Active** | — | Backlog of UX improvement ideas (4/7 done, rest are future work) |
| [OFFLINE_UX_TESTING](./OFFLINE_UX_TESTING.md) | **Active** | — | Demo mode (`--demo` flag) for offline UX testing without real FC hardware. Includes Playwright E2E tests (16 tests). |

## Status Legend

| Status | Meaning |
|--------|---------|
| **Complete** | Fully implemented and merged. Document serves as historical design record. |
| **Active** | Contains a mix of completed and pending items. Living document. |
| **Proposed** | Design only, not yet implemented. |
