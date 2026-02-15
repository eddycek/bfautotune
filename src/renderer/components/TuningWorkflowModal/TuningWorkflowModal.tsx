import React from 'react';
import { TUNING_WORKFLOW } from '@shared/constants/flightGuide';
import type { FlightGuideMode } from '@shared/types/tuning.types';
import { useConnection } from '../../hooks/useConnection';
import { FlightGuideContent } from '../TuningWizard/FlightGuideContent';
import '../../components/ProfileWizard.css';
import './TuningWorkflowModal.css';

/** Strip GYRO_SCALED mention from workflow step description for BF 4.6+ */
function filterWorkflowDescription(desc: string, hideGyroScaled: boolean): string {
  if (!hideGyroScaled) return desc;
  // Remove the "On BF 4.3–4.5, also set debug_mode to GYRO_SCALED (not needed on 2025.12+)." portion
  return desc.replace(/\s*On BF 4\.3–4\.5.*$/, '').replace(/\s*$/, '');
}

function isGyroScaledNotNeeded(version?: string): boolean {
  if (!version) return false;
  const match = version.match(/^(\d+)\.(\d+)/);
  if (!match) return false;
  return parseInt(match[1]) > 4 || (parseInt(match[1]) === 4 && parseInt(match[2]) >= 6);
}

interface TuningWorkflowModalProps {
  onClose: () => void;
  mode?: FlightGuideMode; // 'filter' | 'pid' | 'verification' — undefined = show all
}

function getSubtitle(mode?: FlightGuideMode): string {
  if (mode === 'filter') return 'Follow these steps for the filter tuning flight.';
  if (mode === 'pid') return 'Follow these steps for the PID tuning flight.';
  if (mode === 'verification') return 'Fly a short hover to verify noise improvement after tuning.';
  return 'Follow this workflow each time you tune. Repeat until your quad feels dialed in.';
}

function getWorkflowSteps(mode?: FlightGuideMode) {
  if (mode === 'filter') {
    // Steps 0–5: Connect → Analyze & apply filters
    return TUNING_WORKFLOW.slice(0, 6);
  }
  if (mode === 'pid') {
    // Steps 6–8: Erase again → Analyze & apply PIDs
    return TUNING_WORKFLOW.slice(6, 9);
  }
  if (mode === 'verification') {
    return [];
  }
  return TUNING_WORKFLOW;
}

export function TuningWorkflowModal({ onClose, mode }: TuningWorkflowModalProps) {
  const { status } = useConnection();
  const fcVersion = status.fcInfo?.version;
  const hideGyroScaled = isGyroScaledNotNeeded(fcVersion);
  const steps = getWorkflowSteps(mode);
  const showFilter = mode === undefined || mode === 'filter';
  const showPid = mode === undefined || mode === 'pid';
  const showVerification = mode === undefined;
  const isVerificationMode = mode === 'verification';

  const title = isVerificationMode ? 'Verification Hover' : 'How to Prepare Blackbox Data';

  return (
    <div className="profile-wizard-overlay" onClick={onClose}>
      <div className="profile-wizard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-wizard-header">
          <h2>{title}</h2>
          <p>{getSubtitle(mode)}</p>
        </div>

        {steps.length > 0 && (
          <div className="workflow-steps">
            {steps.map((step, i) => (
              <div key={i} className="workflow-step">
                <div className="workflow-step-number">{i + 1}</div>
                <div className="workflow-step-content">
                  <div className="workflow-step-title">{step.title}</div>
                  <div className="workflow-step-desc">
                    {filterWorkflowDescription(step.description, hideGyroScaled)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {isVerificationMode && <FlightGuideContent mode="verification" fcVersion={fcVersion} />}

        {showFilter && (
          <>
            <hr className="workflow-divider" />
            <h3 className="workflow-subheading">Flight 1: Filter Test Flight</h3>
            <FlightGuideContent mode="filter" fcVersion={fcVersion} />
          </>
        )}

        {showPid && (
          <>
            <hr className="workflow-divider" />
            <h3 className="workflow-subheading">Flight 2: PID Test Flight</h3>
            <FlightGuideContent mode="pid" fcVersion={fcVersion} />
          </>
        )}

        {showVerification && (
          <>
            <hr className="workflow-divider" />
            <h3 className="workflow-subheading">Optional: Verification Hover</h3>
            <FlightGuideContent mode="verification" fcVersion={fcVersion} />
          </>
        )}

        <div className="workflow-modal-actions">
          <button className="wizard-btn wizard-btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
