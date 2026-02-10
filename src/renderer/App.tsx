import React, { useState, useEffect } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel/ConnectionPanel';
import { FCInfoDisplay } from './components/FCInfo/FCInfoDisplay';
import { BlackboxStatus } from './components/BlackboxStatus/BlackboxStatus';
import { SnapshotManager } from './components/SnapshotManager/SnapshotManager';
import { ProfileWizard } from './components/ProfileWizard';
import { ProfileSelector } from './components/ProfileSelector';
import { TuningWizard } from './components/TuningWizard/TuningWizard';
import { AnalysisOverview } from './components/AnalysisOverview/AnalysisOverview';
import { TuningWorkflowModal } from './components/TuningWorkflowModal/TuningWorkflowModal';
import { TuningStatusBanner } from './components/TuningStatusBanner/TuningStatusBanner';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast/ToastContainer';
import { useProfiles } from './hooks/useProfiles';
import { useTuningSession } from './hooks/useTuningSession';
import { useToast } from './hooks/useToast';
import type { FCInfo } from '@shared/types/common.types';
import type { ProfileCreationInput } from '@shared/types/profile.types';
import type { TuningMode } from '@shared/types/tuning.types';
import type { TuningAction } from './components/TuningStatusBanner/TuningStatusBanner';
import './App.css';

function AppContent() {
  const [showProfileWizard, setShowProfileWizard] = useState(false);
  const [newFCSerial, setNewFCSerial] = useState<string | null>(null);
  const [newFCInfo, setNewFCInfo] = useState<FCInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [analysisLogId, setAnalysisLogId] = useState<string | null>(null);
  const [wizardMode, setWizardMode] = useState<TuningMode>('filter');
  const [showWorkflowHelp, setShowWorkflowHelp] = useState(false);
  const [showFlightGuideMode, setShowFlightGuideMode] = useState<TuningMode | null>(null);
  const { createProfile, createProfileFromPreset, currentProfile } = useProfiles();
  const tuning = useTuningSession();
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

  const handleTuningAction = async (action: TuningAction) => {
    switch (action) {
      case 'erase_flash':
        try {
          await window.betaflight.eraseBlackboxFlash();
          toast.success('Flash memory erased');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to erase flash');
        }
        break;
      case 'download_log':
        // Trigger download via BlackboxStatus (user can click Download from there)
        toast.info('Use the Download button in Blackbox Storage below');
        break;
      case 'open_filter_wizard':
        if (activeLogId) {
          setWizardMode('filter');
        } else {
          toast.info('Download a Blackbox log first, then click Analyze');
        }
        break;
      case 'open_pid_wizard':
        if (activeLogId) {
          setWizardMode('pid');
        } else {
          toast.info('Download a Blackbox log first, then click Analyze');
        }
        break;
      case 'start_new_cycle':
        try {
          await tuning.startSession();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to start new cycle');
        }
        break;
      case 'dismiss':
        try {
          await tuning.resetSession();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to reset session');
        }
        break;
    }
  };

  const handleAnalyze = (logId: string) => {
    if (tuning.session) {
      // Active tuning session — open wizard in mode matching current phase
      const phase = tuning.session.phase;
      if (phase === 'filter_analysis') {
        setWizardMode('filter');
      } else if (phase === 'pid_analysis') {
        setWizardMode('pid');
      } else {
        setWizardMode('filter');
      }
      setActiveLogId(logId);
    } else {
      // No tuning session — open read-only analysis overview
      setAnalysisLogId(logId);
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
        {analysisLogId ? (
          <AnalysisOverview logId={analysisLogId} onExit={() => setAnalysisLogId(null)} />
        ) : activeLogId ? (
          <TuningWizard logId={activeLogId} mode={wizardMode} onExit={() => setActiveLogId(null)} />
        ) : (
          <div className="main-content">
            {isConnected && currentProfile && <ProfileSelector />}
            {isConnected && currentProfile && tuning.session && (
              <TuningStatusBanner
                session={tuning.session}
                onAction={handleTuningAction}
                onViewGuide={(mode) => setShowFlightGuideMode(mode)}
                onReset={async () => {
                  try {
                    await tuning.resetSession();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to reset');
                  }
                }}
              />
            )}
            {isConnected && currentProfile && !tuning.session && !tuning.loading && (
              <div className="start-tuning-banner">
                <p>Ready to tune? Start a guided two-flight tuning session.</p>
                <button
                  className="wizard-btn wizard-btn-primary"
                  onClick={async () => {
                    try {
                      await tuning.startSession();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Failed to start tuning session');
                    }
                  }}
                >
                  Start Tuning Session
                </button>
              </div>
            )}
            <ConnectionPanel />
            {isConnected && <FCInfoDisplay />}
            {isConnected && <BlackboxStatus onAnalyze={handleAnalyze} readonly={!!tuning.session} />}
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

      {showFlightGuideMode && (
        <TuningWorkflowModal onClose={() => setShowFlightGuideMode(null)} />
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
