import React, { useState, useEffect } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel/ConnectionPanel';
import { FCInfoDisplay } from './components/FCInfo/FCInfoDisplay';
import { BlackboxStatus } from './components/BlackboxStatus/BlackboxStatus';
import { SnapshotManager } from './components/SnapshotManager/SnapshotManager';
import { ProfileWizard } from './components/ProfileWizard';
import { ProfileSelector } from './components/ProfileSelector';
import { TuningWizard } from './components/TuningWizard/TuningWizard';
import { TuningWorkflowModal } from './components/TuningWorkflowModal/TuningWorkflowModal';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast/ToastContainer';
import { useProfiles } from './hooks/useProfiles';
import { useToast } from './hooks/useToast';
import type { FCInfo } from '@shared/types/common.types';
import type { ProfileCreationInput } from '@shared/types/profile.types';
import './App.css';

function AppContent() {
  const [showProfileWizard, setShowProfileWizard] = useState(false);
  const [newFCSerial, setNewFCSerial] = useState<string | null>(null);
  const [newFCInfo, setNewFCInfo] = useState<FCInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [showWorkflowHelp, setShowWorkflowHelp] = useState(false);
  const { createProfile, createProfileFromPreset, currentProfile } = useProfiles();
  const toast = useToast();

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
      const message = error instanceof Error ? error.message : 'Failed to create profile';
      toast.error(message);
      // Keep wizard open on error so user can retry
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Betaflight PID AutoTune</h1>
        <div className="app-header-right">
          <span className="version">v0.1.0</span>
          <button
            className="app-help-button"
            onClick={() => setShowWorkflowHelp(true)}
            title="How to prepare Blackbox data"
          >
            How to tune?
          </button>
        </div>
      </header>

      <main className="app-main">
        {activeLogId ? (
          <TuningWizard logId={activeLogId} onExit={() => setActiveLogId(null)} />
        ) : (
          <div className="main-content">
            {isConnected && currentProfile && <ProfileSelector />}
            <ConnectionPanel />
            {isConnected && <FCInfoDisplay />}
            {isConnected && <BlackboxStatus onAnalyze={setActiveLogId} />}
            {isConnected && currentProfile && <SnapshotManager />}
          </div>
        )}
      </main>

      {showProfileWizard && newFCSerial && newFCInfo && (
        <ProfileWizard
          fcSerial={newFCSerial}
          fcInfo={newFCInfo}
          onComplete={handleProfileWizardComplete}
        />
      )}

      {showWorkflowHelp && (
        <TuningWorkflowModal onClose={() => setShowWorkflowHelp(false)} />
      )}

      <ToastContainer />
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
