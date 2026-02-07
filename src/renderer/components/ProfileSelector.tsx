import { useState } from 'react';
import { ProfileCard } from './ProfileCard';
import { useProfiles } from '../hooks/useProfiles';

export function ProfileSelector() {
  const {
    profiles,
    currentProfile,
    loading,
    error,
    setAsCurrentProfile,
    deleteProfile,
    exportProfile
  } = useProfiles();

  const [expanded, setExpanded] = useState(false);

  const handleSelect = async (id: string) => {
    if (currentProfile?.id === id) {
      // If clicking current profile, just collapse
      setExpanded(false);
    } else {
      try {
        await setAsCurrentProfile(id);
        setExpanded(false);
      } catch (err) {
        console.error('Failed to switch profile:', err);
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProfile(id);
    } catch (err) {
      console.error('Failed to delete profile:', err);
    }
  };

  const handleExport = async (id: string) => {
    // In Electron, we would use dialog to get save path
    // For now, just log
    console.log('Export profile:', id);
    // TODO: Implement export with file dialog
    alert('Export functionality will be implemented with file dialog');
  };

  if (!currentProfile && profiles.length === 0) {
    return null; // Don't show if no profiles exist yet
  }

  return (
    <div className="profile-selector mb-4">
      <div className="bg-gray-800 rounded-lg p-4">
        {/* Current Profile Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex-1">
            <div className="text-xs text-gray-400 mb-1">Current Drone Profile</div>
            {currentProfile ? (
              <div className="font-semibold text-white">
                {currentProfile.name}
                <span className="ml-2 text-xs text-gray-500">
                  ({currentProfile.size} • {currentProfile.battery})
                </span>
              </div>
            ) : (
              <div className="text-gray-400">No profile selected</div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {profiles.length} profile{profiles.length !== 1 ? 's' : ''}
            </span>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Profile List */}
        {expanded && (
          <div className="mt-4 space-y-2 border-t border-gray-700 pt-4">
            {loading && (
              <div className="text-center text-gray-400 py-4">Loading profiles...</div>
            )}

            {error && (
              <div className="text-center text-red-400 py-4">{error}</div>
            )}

            {!loading && !error && profiles.length === 0 && (
              <div className="text-center text-gray-400 py-4">
                No profiles yet. Connect a flight controller to create one.
              </div>
            )}

            {!loading && !error && profiles.length > 0 && (
              <>
                {profiles.map((profile) => (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    isActive={currentProfile?.id === profile.id}
                    onSelect={handleSelect}
                    onDelete={handleDelete}
                    onExport={handleExport}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
