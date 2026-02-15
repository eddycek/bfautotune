import React from 'react';
import type {
  TuningSession,
  TuningPhase,
  TuningMode,
  FlightGuideMode,
} from '@shared/types/tuning.types';
import './TuningStatusBanner.css';

export type TuningAction =
  | 'erase_flash'
  | 'download_log'
  | 'open_filter_wizard'
  | 'open_pid_wizard'
  | 'start_new_cycle'
  | 'complete_session'
  | 'skip_verification'
  | 'prepare_verification'
  | 'analyze_verification'
  | 'dismiss';

interface TuningStatusBannerProps {
  session: TuningSession;
  flashErased?: boolean;
  flashUsedSize?: number | null;
  erasing?: boolean;
  downloading?: boolean;
  downloadProgress?: number;
  analyzingVerification?: boolean;
  bbSettingsOk?: boolean;
  fixingSettings?: boolean;
  onAction: (action: TuningAction) => void;
  onViewGuide: (mode: FlightGuideMode) => void;
  onReset: () => void;
  onFixSettings?: () => void;
}

interface PhaseUI {
  stepIndex: number;
  text: string;
  buttonLabel: string;
  action: TuningAction;
  guideTip?: TuningMode;
}

const STEP_LABELS = ['Prepare', 'Filter Flight', 'Filter Tune', 'PID Flight', 'PID Tune', 'Verify'];

const PHASE_UI: Record<Exclude<TuningPhase, 'pid_applied' | 'verification_pending'>, PhaseUI> = {
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
  completed: {
    stepIndex: 5,
    text: 'Tuning complete! Your drone is dialed in.',
    buttonLabel: 'Dismiss',
    action: 'dismiss',
  },
};

function getVerificationUI(session: TuningSession): { stepIndex: number; text: string } {
  if (session.verificationLogId) {
    return {
      stepIndex: 5,
      text: 'Verification log ready. Analyze to compare noise before and after tuning.',
    };
  }
  return {
    stepIndex: 5,
    text: 'Download the verification hover log, or skip verification.',
  };
}

export function TuningStatusBanner({
  session,
  flashErased,
  flashUsedSize,
  erasing,
  downloading,
  downloadProgress,
  analyzingVerification,
  bbSettingsOk,
  fixingSettings,
  onAction,
  onViewGuide,
  onReset,
  onFixSettings,
}: TuningStatusBannerProps) {
  const downloadLabel =
    downloadProgress && downloadProgress > 0
      ? `Downloading... ${downloadProgress}%`
      : 'Downloading...';
  const isPidApplied = session.phase === 'pid_applied';
  const isVerification = session.phase === 'verification_pending';
  const isFlightPending =
    session.phase === 'filter_flight_pending' || session.phase === 'pid_flight_pending';

  // Determine step index and text
  let stepIndex: number;
  let text: string;
  let ui: PhaseUI | undefined;

  if (isPidApplied) {
    stepIndex = 4;
    text = 'PIDs applied! Fly a short hover to verify noise improvement, or skip.';
  } else if (isVerification) {
    const vui = getVerificationUI(session);
    stepIndex = vui.stepIndex;
    text = vui.text;
  } else {
    ui = PHASE_UI[session.phase as Exclude<TuningPhase, 'pid_applied' | 'verification_pending'>];
    stepIndex = ui.stepIndex;
    text = ui.text;
  }

  const flashHasData = flashUsedSize != null && flashUsedSize > 0;
  const showErasedState =
    !flashHasData && (flashErased || flashUsedSize === 0) && (isFlightPending || isVerification);
  const flightType = session.phase === 'filter_flight_pending' ? 'filter' : 'PID';
  const activeStepIndex = showErasedState && isFlightPending ? stepIndex + 1 : stepIndex;

  const showBBWarning = isFlightPending && !showErasedState && bbSettingsOk === false;

  const renderActions = () => {
    // Flash erased state for flight pending / verification phases — show flight guide
    if (showErasedState && (ui?.guideTip || isVerification)) {
      const guideMode: FlightGuideMode = isVerification ? 'verification' : ui!.guideTip!;
      return (
        <>
          <button className="wizard-btn wizard-btn-primary" onClick={() => onViewGuide(guideMode)}>
            View Flight Guide
          </button>
          {isVerification && (
            <button
              className="wizard-btn wizard-btn-secondary"
              onClick={() => onAction('skip_verification')}
            >
              Skip & Complete
            </button>
          )}
        </>
      );
    }

    // pid_applied: Prepare Verification + Skip
    if (isPidApplied) {
      return (
        <>
          <button
            className="wizard-btn wizard-btn-primary"
            onClick={() => onAction('prepare_verification')}
            disabled={erasing}
          >
            {erasing ? (
              <>
                <span className="spinner" />
                Preparing...
              </>
            ) : (
              'Erase & Verify'
            )}
          </button>
          <button
            className="wizard-btn wizard-btn-secondary"
            onClick={() => onAction('skip_verification')}
            disabled={erasing}
          >
            Skip & Complete
          </button>
        </>
      );
    }

    // verification_pending: dynamic based on verificationLogId
    if (isVerification) {
      if (session.verificationLogId) {
        return (
          <>
            <button
              className="wizard-btn wizard-btn-primary"
              onClick={() => onAction('analyze_verification')}
              disabled={analyzingVerification}
            >
              {analyzingVerification ? (
                <>
                  <span className="spinner" />
                  Analyzing...
                </>
              ) : (
                'Analyze Verification'
              )}
            </button>
            <button
              className="wizard-btn wizard-btn-secondary"
              onClick={() => onAction('skip_verification')}
              disabled={analyzingVerification}
            >
              Skip & Complete
            </button>
          </>
        );
      }
      return (
        <>
          <button
            className="wizard-btn wizard-btn-primary"
            onClick={() => onAction('download_log')}
            disabled={downloading}
          >
            {downloading ? (
              <>
                <span className="spinner" />
                {downloadLabel}
              </>
            ) : (
              'Download Log'
            )}
          </button>
          <button
            className="wizard-btn wizard-btn-secondary"
            onClick={() => onAction('skip_verification')}
            disabled={downloading}
          >
            Skip & Complete
          </button>
        </>
      );
    }

    // Default: static PHASE_UI action
    return (
      <>
        <button
          className="wizard-btn wizard-btn-primary"
          onClick={() => onAction(ui!.action)}
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
              {downloadLabel}
            </>
          ) : (
            ui!.buttonLabel
          )}
        </button>
        {ui!.guideTip && !erasing && !downloading && (
          <button
            className="wizard-btn wizard-btn-secondary"
            onClick={() => onViewGuide(ui!.guideTip!)}
          >
            View Flight Guide
          </button>
        )}
      </>
    );
  };

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
                <div className="tuning-status-indicator">{isDone ? '\u2713' : i + 1}</div>
                <span className="tuning-status-label">{label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className="tuning-status-body">
        {showBBWarning && (
          <div className="tuning-bb-warning">
            <span>Blackbox settings need to be fixed before flying. Data may be unusable.</span>
            {onFixSettings && (
              <button
                className="wizard-btn wizard-btn-warning"
                onClick={onFixSettings}
                disabled={fixingSettings}
              >
                {fixingSettings ? 'Fixing...' : 'Fix Settings'}
              </button>
            )}
          </div>
        )}
        <p className="tuning-status-text">
          {showErasedState
            ? isVerification
              ? 'Flash erased! Disconnect and fly a 30-60s hover to verify noise improvement.'
              : `Flash erased! Disconnect your drone and fly the ${flightType} test flight.`
            : text}
        </p>
        <div className="tuning-status-actions">
          {renderActions()}
          <button className="wizard-btn wizard-btn-text" onClick={onReset}>
            Reset Session
          </button>
        </div>
      </div>
    </div>
  );
}
