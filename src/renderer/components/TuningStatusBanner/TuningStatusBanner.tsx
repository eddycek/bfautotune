import React from 'react';
import type { TuningSession, TuningPhase, TuningMode } from '@shared/types/tuning.types';
import './TuningStatusBanner.css';

export type TuningAction =
  | 'erase_flash'
  | 'download_log'
  | 'open_filter_wizard'
  | 'open_pid_wizard'
  | 'start_new_cycle'
  | 'dismiss';

interface TuningStatusBannerProps {
  session: TuningSession;
  flashErased?: boolean;
  erasing?: boolean;
  downloading?: boolean;
  onAction: (action: TuningAction) => void;
  onViewGuide: (mode: TuningMode) => void;
  onReset: () => void;
}

interface PhaseUI {
  stepIndex: number;
  text: string;
  buttonLabel: string;
  action: TuningAction;
  guideTip?: TuningMode;
}

const STEP_LABELS = ['Prepare', 'Filter Test Flight', 'Filter Tune', 'PID Test Flight', 'PID Tune'];

const PHASE_UI: Record<TuningPhase, PhaseUI> = {
  filter_flight_pending: {
    stepIndex: 0,
    text: 'Erase Blackbox data, then fly the filter test flight (hover + throttle sweeps).',
    buttonLabel: 'Erase Flash',
    action: 'erase_flash',
    guideTip: 'filter',
  },
  filter_log_ready: {
    stepIndex: 1,
    text: 'Filter flight done! Download the Blackbox log to start analysis.',
    buttonLabel: 'Download Log',
    action: 'download_log',
  },
  filter_analysis: {
    stepIndex: 2,
    text: 'Log downloaded. Run the Filter Wizard to analyze noise and apply filter changes.',
    buttonLabel: 'Open Filter Wizard',
    action: 'open_filter_wizard',
  },
  filter_applied: {
    stepIndex: 2,
    text: 'Filters applied! Prepare for the PID test flight.',
    buttonLabel: 'Continue',
    action: 'erase_flash',
    guideTip: 'pid',
  },
  pid_flight_pending: {
    stepIndex: 3,
    text: 'Erase Blackbox data, then fly the PID test flight (stick snaps on all axes).',
    buttonLabel: 'Erase Flash',
    action: 'erase_flash',
    guideTip: 'pid',
  },
  pid_log_ready: {
    stepIndex: 3,
    text: 'PID flight done! Download the Blackbox log to start analysis.',
    buttonLabel: 'Download Log',
    action: 'download_log',
  },
  pid_analysis: {
    stepIndex: 4,
    text: 'Log downloaded. Run the PID Wizard to analyze step response and apply PID changes.',
    buttonLabel: 'Open PID Wizard',
    action: 'open_pid_wizard',
  },
  pid_applied: {
    stepIndex: 4,
    text: 'PIDs applied! Fly a normal flight to verify the feel.',
    buttonLabel: 'Start New Cycle',
    action: 'start_new_cycle',
  },
  verification_pending: {
    stepIndex: 4,
    text: 'Verification flight pending. Fly normally and check the feel.',
    buttonLabel: 'Done',
    action: 'dismiss',
  },
  completed: {
    stepIndex: 4,
    text: 'Tuning complete! Your drone is dialed in.',
    buttonLabel: 'Dismiss',
    action: 'dismiss',
  },
};

export function TuningStatusBanner({ session, flashErased, erasing, downloading, onAction, onViewGuide, onReset }: TuningStatusBannerProps) {
  const ui = PHASE_UI[session.phase];
  const isFlightPending = session.phase === 'filter_flight_pending' || session.phase === 'pid_flight_pending';
  const showErasedState = flashErased && isFlightPending;
  const flightType = session.phase === 'filter_flight_pending' ? 'filter' : 'PID';
  // After erase, advance step: "Prepare" becomes done, "Flight" becomes current
  const activeStepIndex = showErasedState ? ui.stepIndex + 1 : ui.stepIndex;

  return (
    <div className="tuning-status-banner">
      <div className="tuning-status-steps">
        {STEP_LABELS.map((label, i) => {
          const isDone = i < activeStepIndex;
          const isCurrent = i === activeStepIndex;
          const className = isDone ? 'done' : isCurrent ? 'current' : 'upcoming';
          return (
            <React.Fragment key={label}>
              {i > 0 && <div className={`tuning-status-line ${isDone ? 'done' : ''}`} />}
              <div className={`tuning-status-step ${className}`}>
                <div className="tuning-status-indicator">
                  {isDone ? '\u2713' : i + 1}
                </div>
                <span className="tuning-status-label">{label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className="tuning-status-body">
        <p className="tuning-status-text">
          {showErasedState
            ? `Flash erased! Disconnect your drone and fly the ${flightType} test flight.`
            : ui.text}
        </p>
        <div className="tuning-status-actions">
          {showErasedState ? (
            <button
              className="wizard-btn wizard-btn-primary"
              onClick={() => onViewGuide(ui.guideTip!)}
            >
              View Flight Guide
            </button>
          ) : (
            <>
              <button
                className="wizard-btn wizard-btn-primary"
                onClick={() => onAction(ui.action)}
                disabled={erasing || downloading}
              >
                {erasing ? (
                  <>
                    <span className="spinner" />
                    Erasing...
                  </>
                ) : downloading ? (
                  <>
                    <span className="spinner" />
                    Downloading...
                  </>
                ) : ui.buttonLabel}
              </button>
              {ui.guideTip && !erasing && !downloading && (
                <button
                  className="wizard-btn wizard-btn-secondary"
                  onClick={() => onViewGuide(ui.guideTip!)}
                >
                  View Flight Guide
                </button>
              )}
            </>
          )}
          <button
            className="wizard-btn wizard-btn-text"
            onClick={onReset}
          >
            Reset Session
          </button>
        </div>
      </div>
    </div>
  );
}
