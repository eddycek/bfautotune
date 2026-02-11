import React from 'react';
import { TUNING_WORKFLOW } from '@shared/constants/flightGuide';
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
}

export function TuningWorkflowModal({ onClose }: TuningWorkflowModalProps) {
  const { status } = useConnection();
  const fcVersion = status.fcInfo?.version;
  const hideGyroScaled = isGyroScaledNotNeeded(fcVersion);
  return (
    <div className="profile-wizard-overlay" onClick={onClose}>
      <div
        className="profile-wizard-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-wizard-header">
          <h2>How to Prepare Blackbox Data</h2>
          <p>
            Follow this workflow each time you tune. Repeat until your quad
            feels dialed in.
          </p>
        </div>

        <div className="workflow-steps">
          {TUNING_WORKFLOW.map((step, i) => (
            <div key={i} className="workflow-step">
              <div className="workflow-step-number">{i + 1}</div>
              <div className="workflow-step-content">
                <div className="workflow-step-title">{step.title}</div>
                <div className="workflow-step-desc">{filterWorkflowDescription(step.description, hideGyroScaled)}</div>
              </div>
            </div>
          ))}
        </div>

        <hr className="workflow-divider" />

        <h3 className="workflow-subheading">Flight 1: Filter Test Flight</h3>
        <FlightGuideContent mode="filter" fcVersion={fcVersion} />

        <hr className="workflow-divider" />

        <h3 className="workflow-subheading">Flight 2: PID Test Flight</h3>
        <FlightGuideContent mode="pid" fcVersion={fcVersion} />

        <hr className="workflow-divider" />

        <h3 className="workflow-subheading">Optional: Verification Hover</h3>
        <p className="workflow-step-desc">
          After applying PIDs, you can fly a short 30-second hover to compare noise levels before and after tuning. The app overlays the original and new noise spectra so you can see the improvement. This step is optional — skip it if the quad already feels good.
        </p>

        <div className="workflow-modal-actions">
          <button className="wizard-btn wizard-btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
