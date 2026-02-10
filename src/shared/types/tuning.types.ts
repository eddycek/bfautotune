/**
 * Types for the stateful two-flight iterative tuning workflow.
 *
 * The tuning process is split into two flights:
 * 1. Filter flight (hover + throttle sweeps) → filter analysis → apply
 * 2. PID flight (stick snaps) → PID analysis → apply
 *
 * A persistent TuningSession tracks progress across connect/disconnect cycles.
 */

/** Which analysis mode the wizard is operating in */
export type TuningMode = 'filter' | 'pid' | 'full';

/** Phases of the tuning session state machine */
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

/** A single setting change applied during tuning */
export interface AppliedChange {
  setting: string;
  previousValue: number;
  newValue: number;
}

/** Persistent tuning session tracking progress across flights */
export interface TuningSession {
  /** Profile this session belongs to */
  profileId: string;

  /** Current phase of the tuning process */
  phase: TuningPhase;

  /** When the session was started (ISO string) */
  startedAt: string;

  /** When the phase last changed (ISO string) */
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
