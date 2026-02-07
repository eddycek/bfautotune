import type { DroneProfileMetadata } from '@shared/types/profile.types';

interface ProfileCardProps {
  profile: DroneProfileMetadata;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
}

export function ProfileCard({ profile, isActive, onSelect, onDelete, onExport }: ProfileCardProps) {
  const lastConnectedDate = new Date(profile.lastConnected);
  const isRecent = Date.now() - lastConnectedDate.getTime() < 24 * 60 * 60 * 1000; // Last 24h

  return (
    <div
      className={`
        profile-card p-4 rounded-lg border-2 transition-all cursor-pointer
        ${isActive
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
        }
      `}
      onClick={() => onSelect(profile.id)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-white">{profile.name}</h3>
            {isActive && (
              <span className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded">
                Active
              </span>
            )}
            {isRecent && !isActive && (
              <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">
                Recent
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            Serial: {profile.fcSerialNumber.slice(0, 8)}...
          </div>
        </div>

        <div className="flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExport(profile.id);
            }}
            className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
            title="Export profile"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          {!isActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete profile "${profile.name}"?`)) {
                  onDelete(profile.id);
                }
              }}
              className="p-2 text-gray-400 hover:text-red-400 transition-colors"
              title="Delete profile"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div>
          <span className="text-gray-500">Size:</span>{' '}
          <span className="text-gray-300">{profile.size}</span>
        </div>
        <div>
          <span className="text-gray-500">Battery:</span>{' '}
          <span className="text-gray-300">{profile.battery}</span>
        </div>
        <div>
          <span className="text-gray-500">Connections:</span>{' '}
          <span className="text-gray-300">{profile.connectionCount}</span>
        </div>
      </div>

      <div className="text-xs text-gray-500">
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
