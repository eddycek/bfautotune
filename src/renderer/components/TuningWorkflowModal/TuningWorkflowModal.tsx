import React from 'react';
import { TUNING_WORKFLOW } from '@shared/constants/flightGuide';
import { FlightGuideContent } from '../TuningWizard/FlightGuideContent';
import '../../components/ProfileWizard.css';
import './TuningWorkflowModal.css';

interface TuningWorkflowModalProps {
  onClose: () => void;
}

export function TuningWorkflowModal({ onClose }: TuningWorkflowModalProps) {
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
                <div className="workflow-step-desc">{step.description}</div>
              </div>
            </div>
          ))}
        </div>

        <hr className="workflow-divider" />

        <h3 className="workflow-subheading">Test Flight Guide</h3>
        <FlightGuideContent />

        <div className="workflow-modal-actions">
          <button className="wizard-btn wizard-btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
