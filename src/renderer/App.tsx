import React, { useState, useEffect } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel/ConnectionPanel';
import { FCInfoDisplay } from './components/FCInfo/FCInfoDisplay';
import { SnapshotManager } from './components/SnapshotManager/SnapshotManager';
import { ProfileWizard } from './components/ProfileWizard';
import { ProfileSelector } from './components/ProfileSelector';
import { useProfiles } from './hooks/useProfiles';
import type { FCInfo } from '@shared/types/common.types';
import type { ProfileCreationInput } from '@shared/types/profile.types';
import './App.css';

function App() {
  const [showProfileWizard, setShowProfileWizard] = useState(false);
  const [newFCSerial, setNewFCSerial] = useState<string | null>(null);
  const [newFCInfo, setNewFCInfo] = useState<FCInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { createProfile, createProfileFromPreset, currentProfile } = useProfiles();

  useEffect(() => {
    // Listen for connection changes
    const unsubscribeConnection = window.betaflight.onConnectionChanged((status) => {
      setIsConnected(status.connected);
    });

    // Listen for new FC detection
    const unsubscribeNewFC = window.betaflight.onNewFCDetected((fcSerial, fcInfo) => {
      setNewFCSerial(fcSerial);
      setNewFCInfo(fcInfo);
      setShowProfileWizard(true);
    });

    return () => {
      unsubscribeConnection();
      unsubscribeNewFC();
    };
  }, []);

  const handleProfileWizardComplete = async (input: ProfileCreationInput | { presetId: string; customName?: string }) => {
    try {
      if ('presetId' in input) {
        // Create from preset
        await createProfileFromPreset(input.presetId, input.customName);
      } else {
        // Create custom profile
        await createProfile(input);
      }
      setShowProfileWizard(false);
      setNewFCSerial(null);
      setNewFCInfo(null);
    } catch (error) {
      console.error('Failed to create profile:', error);
      // Keep wizard open on error so user can retry
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Beta PIDTune</h1>
        <span className="version">v0.1.0</span>
      </header>

      <main className="app-main">
        <div className="main-content">
          {isConnected && currentProfile && <ProfileSelector />}
          <ConnectionPanel />
          {isConnected && <FCInfoDisplay />}
          {isConnected && currentProfile && <SnapshotManager />}
        </div>
      </main>

      {showProfileWizard && newFCSerial && newFCInfo && (
        <ProfileWizard
          fcSerial={newFCSerial}
          fcInfo={newFCInfo}
          onComplete={handleProfileWizardComplete}
        />
      )}
    </div>
  );
}

export default App;
