import React, { useState } from 'react';
import '../ProfileWizard.css';
import './ApplyConfirmationModal.css';

interface ApplyConfirmationModalProps {
  filterCount: number;
  pidCount: number;
  onConfirm: (createSnapshot: boolean) => void;
  onCancel: () => void;
}

export function ApplyConfirmationModal({
  filterCount,
  pidCount,
  onConfirm,
  onCancel,
}: ApplyConfirmationModalProps) {
  const [createSnapshot, setCreateSnapshot] = useState(true);
  const totalChanges = filterCount + pidCount;

  return (
    <div className="profile-wizard-overlay" onClick={onCancel}>
      <div
        className="profile-wizard-modal apply-confirm-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-wizard-header">
          <h2>Apply Tuning Changes</h2>
          <p>
            {totalChanges} change{totalChanges !== 1 ? 's' : ''} will be written to your flight controller.
          </p>
        </div>

        <div className="apply-confirm-summary">
          {filterCount > 0 && (
            <span className="analysis-meta-pill">
              {filterCount} filter change{filterCount !== 1 ? 's' : ''} (via CLI)
            </span>
          )}
          {pidCount > 0 && (
            <span className="analysis-meta-pill">
              {pidCount} PID change{pidCount !== 1 ? 's' : ''} (via MSP)
            </span>
          )}
        </div>

        <label className="apply-confirm-checkbox">
          <input
            type="checkbox"
            checked={createSnapshot}
            onChange={(e) => setCreateSnapshot(e.target.checked)}
          />
          <span>Create safety snapshot before applying</span>
        </label>

        <div className="apply-confirm-warning">
          Your FC will reboot after applying. You will need to reconnect.
        </div>

        <div className="apply-confirm-actions">
          <button
            className="wizard-btn wizard-btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="wizard-btn wizard-btn-success"
            onClick={() => onConfirm(createSnapshot)}
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
