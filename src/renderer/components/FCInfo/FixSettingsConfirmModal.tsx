import React from 'react';
import '../ProfileWizard.css';

interface FixSettingsConfirmModalProps {
  commands: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function FixSettingsConfirmModal({ commands, onConfirm, onCancel }: FixSettingsConfirmModalProps) {
  return (
    <div className="profile-wizard-overlay" onClick={onCancel}>
      <div
        className="profile-wizard-modal fix-settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-wizard-header">
          <h2>Fix Blackbox Settings</h2>
          <p>The following commands will be sent to your flight controller:</p>
        </div>

        <div className="fix-settings-commands">
          {commands.map((cmd, i) => (
            <code key={i} className="fix-settings-cmd">{cmd}</code>
          ))}
        </div>

        <div className="fix-settings-warning">
          Your FC will save settings and reboot. You will need to reconnect.
        </div>

        <div className="fix-settings-actions">
          <button className="wizard-btn wizard-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="wizard-btn wizard-btn-primary" onClick={onConfirm}>
            Fix &amp; Reboot
          </button>
        </div>
      </div>
    </div>
  );
}
