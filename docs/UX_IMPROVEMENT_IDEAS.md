# UX Improvement Ideas

Collected ideas for improving the tuning workflow UX. Roughly prioritized by impact.

## ~~1. Pre-Flight Blackbox Settings Check~~ :white_check_mark: Done

Implemented: FCInfoDisplay shows "Fix Settings" button when blackbox settings are wrong. TuningStatusBanner shows amber pre-flight warning during `*_flight_pending` phases with one-click "Fix Settings" button. Both trigger `FC_FIX_BLACKBOX_SETTINGS` IPC → CLI commands → save & reboot.

## 2. Flight Type Validation After Download

After downloading a log, quickly check if it matches the expected flight type: hover segments for filter phase, step inputs for PID phase. Warn before running analysis if data doesn't match. Saves time and avoids misleading recommendations.

## 3. Before/After Comparison on Completion :arrow_right: [Design Doc](./TUNING_HISTORY_AND_COMPARISON.md)

When session reaches `completed`, show a diff of pre-tuning vs post-tuning snapshots: what changed and why (from recommendation reasons). Gives the user a sense of closure and a clear summary of the tuning outcome.

**Planned**: TuningCompletionSummary component showing applied changes table + analysis metrics. See design doc for details.

## 4. Cherry-Pick Recommendations Before Apply

Allow users to select individual recommendations instead of all-or-nothing apply. Checkboxes on `RecommendationCard` items in `TuningSummaryStep`. Useful for experienced users who want fine-grained control.

## 5. Verification Flight Guidance :arrow_right: [Design Doc](./TUNING_HISTORY_AND_COMPARISON.md)

The `verification_pending` phase exists but has no guidance. Offer "Fly a verification flight" flow: download log, run filter analysis, show before/after noise comparison.

**Planned**: Verification hover flight provides "after" noise spectrum for overlay chart comparison with the original filter flight ("before"). Optional — user can skip. See design doc section 2.9 for details.

## 6. Tuning Session History :arrow_right: [Design Doc](./TUNING_HISTORY_AND_COMPARISON.md)

Currently one session per profile, overwritten each time. Keep a history of past sessions: date, changes applied, before/after metrics. Useful for tracking tuning evolution and sharing results.

**Planned**: TuningHistoryManager archives completed sessions. TuningHistoryPanel shows timeline on dashboard. See design doc for details.

## 7. Recovery After Interrupted Apply

If USB disconnects mid-apply, the pre-tuning snapshot is the safety net. On reconnect, detect inconsistent state and offer "Restore pre-tuning snapshot" directly in the banner for a smoother recovery UX.
