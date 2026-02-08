import type { DroneProfileMetadata } from '@shared/types/profile.types';
import './ProfileCard.css';

interface ProfileCardProps {
  profile: DroneProfileMetadata;
  isActive: boolean;
  isLocked?: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
}

export function ProfileCard({ profile, isActive, isLocked, onSelect, onEdit, onDelete, onExport }: ProfileCardProps) {
  const lastConnectedDate = new Date(profile.lastConnected);
  const isRecent = Date.now() - lastConnectedDate.getTime() < 24 * 60 * 60 * 1000; // Last 24h

  const handleClick = () => {
    if (isLocked) {
      return; // Don't allow switching when locked
    }
    onSelect(profile.id);
  };

  return (
    <div
      className={`profile-card ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
      onClick={handleClick}
    >
      <div className="profile-card-header">
        <div className="profile-card-info">
          <div className="profile-card-title">
            <div className="profile-card-name">{profile.name}</div>
            {isActive && (
              <span className="profile-card-badge active">Active</span>
            )}
            {isRecent && !isActive && (
              <span className="profile-card-badge recent">Recent</span>
            )}
          </div>
          <div className="profile-card-serial">
            {profile.fcSerialNumber.slice(0, 16)}
          </div>
        </div>

        <div className="profile-card-actions">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(profile.id);
            }}
            className="profile-card-action-btn edit"
            title="Edit profile"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onExport(profile.id);
            }}
            className="profile-card-action-btn"
            title="Export profile"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(profile.id);
            }}
            className="profile-card-action-btn delete"
            title="Delete profile"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="profile-card-stats">
        <div className="profile-card-stat">
          <div className="profile-card-stat-label">Size</div>
          <div className="profile-card-stat-value">{profile.size}</div>
        </div>
        <div className="profile-card-stat">
          <div className="profile-card-stat-label">Battery</div>
          <div className="profile-card-stat-value">{profile.battery}</div>
        </div>
        <div className="profile-card-stat">
          <div className="profile-card-stat-label">Connections</div>
          <div className="profile-card-stat-value">{profile.connectionCount}</div>
        </div>
      </div>

      <div className="profile-card-footer">
        Last connected: {formatRelativeTime(lastConnectedDate)}
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString();
  } else if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  } else {
    return 'Just now';
  }
}
