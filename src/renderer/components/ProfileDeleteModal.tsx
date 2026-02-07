import { useState } from 'react';
import type { DroneProfile } from '@shared/types/profile.types';
import './ProfileWizard.css';

interface ProfileDeleteModalProps {
  profile: DroneProfile;
  isActive: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function ProfileDeleteModal({ profile, isActive, onConfirm, onCancel }: ProfileDeleteModalProps) {
  const snapshotCount = profile.snapshotIds.length;
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="profile-wizard-overlay">
      <div className="profile-wizard-modal" style={{ maxWidth: '500px' }}>
        <div className="profile-wizard-header">
          <h2>Delete Profile</h2>
          <p>Are you sure you want to delete this profile?</p>
        </div>

        <div className="review-section">
          <div className="review-row">
            <div className="review-label">Profile Name</div>
            <div className="review-value">{profile.name}</div>
          </div>
          <div className="review-row">
            <div className="review-label">Size</div>
            <div className="review-value">{profile.size}</div>
          </div>
          <div className="review-row">
            <div className="review-label">Battery</div>
            <div className="review-value">{profile.battery}</div>
          </div>
          <div className="review-row">
            <div className="review-label">Snapshots</div>
            <div className="review-value">{snapshotCount}</div>
          </div>
        </div>

        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          padding: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'start'
          }}>
            <svg
              style={{ flexShrink: 0, marginTop: '2px', width: '20px', height: '20px' }}
              fill="#dc2626"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <div style={{ color: '#991b1b', fontWeight: 600, marginBottom: '4px' }}>
                Warning: This action cannot be undone
              </div>
              <div style={{ color: '#7f1d1d', fontSize: '14px' }}>
                {isActive && (
                  <div style={{ marginBottom: '8px', fontWeight: 600 }}>
                    ⚠️ This is your currently active profile!
                  </div>
                )}
                Deleting this profile will permanently remove:
                <ul style={{ marginTop: '8px', marginLeft: '20px' }}>
                  <li>Profile configuration</li>
                  {snapshotCount > 0 && <li>{snapshotCount} snapshot{snapshotCount === 1 ? '' : 's'} and all associated data</li>}
                  <li>All backup files</li>
                  <li>Connection history</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="wizard-actions">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="wizard-btn wizard-btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="wizard-btn"
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              opacity: isDeleting ? 0.5 : 1
            }}
            onMouseEnter={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = '#b91c1c')}
            onMouseLeave={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = '#dc2626')}
          >
            {isDeleting ? 'Deleting...' : 'Delete Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
