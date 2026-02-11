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
import type { TuningMode, AppliedChange } from '@shared/types/tuning.types';
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
  const [erasedForPhase, setErasedForPhase] = useState<string | null>(null);
  const [erasing, setErasing] = useState(false);
  const [downloading, setDownloading] = useState(false);
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
          setErasing(true);
          const currentPhase = tuning.session?.phase;

          // filter_applied "Continue" → transition to pid_flight_pending before erase
          if (currentPhase === 'filter_applied') {
            await tuning.updatePhase('pid_flight_pending');
          }

          await window.betaflight.eraseBlackboxFlash();
          // Re-read phase after potential transition above
          const phaseForErase = currentPhase === 'filter_applied' ? 'pid_flight_pending' : (tuning.session?.phase ?? null);
          setErasedForPhase(phaseForErase);
          toast.success('Flash memory erased');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to erase flash');
        } finally {
          setErasing(false);
        }
        break;
      case 'download_log':
        try {
          setDownloading(true);
          const metadata = await window.betaflight.downloadBlackboxLog();
          toast.success(`Log downloaded: ${metadata.filename}`);

          // Transition session to *_analysis phase and store the log ID
          const phase = tuning.session?.phase;
          if (phase === 'filter_log_ready') {
            await tuning.updatePhase('filter_analysis', { filterLogId: metadata.id });
          } else if (phase === 'pid_log_ready') {
            await tuning.updatePhase('pid_analysis', { pidLogId: metadata.id });
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to download log');
        } finally {
          setDownloading(false);
        }
        break;
      case 'open_filter_wizard': {
        const filterLogId = tuning.session?.filterLogId;
        if (filterLogId) {
          setWizardMode('filter');
          setActiveLogId(filterLogId);
        } else {
          toast.info('Download a Blackbox log first');
        }
        break;
      }
      case 'open_pid_wizard': {
        const pidLogId = tuning.session?.pidLogId;
        if (pidLogId) {
          setWizardMode('pid');
          setActiveLogId(pidLogId);
        } else {
          toast.info('Download a Blackbox log first');
        }
        break;
      }
      case 'start_new_cycle':
        try {
          setErasedForPhase(null);
          await tuning.startSession();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to start new cycle');
        }
        break;
      case 'complete_session':
        try {
          setErasedForPhase(null);
          await tuning.updatePhase('completed');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to complete session');
        }
        break;
      case 'dismiss':
        try {
          setErasedForPhase(null);
          await tuning.resetSession();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to reset session');
        }
        break;
    }
  };

  const handleApplyComplete = async (changes: { filterChanges?: AppliedChange[]; pidChanges?: AppliedChange[] }) => {
    const phase = tuning.session?.phase;
    if (phase === 'filter_analysis') {
      await tuning.updatePhase('filter_applied', { appliedFilterChanges: changes.filterChanges });
    } else if (phase === 'pid_analysis') {
      await tuning.updatePhase('pid_applied', { appliedPIDChanges: changes.pidChanges });
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
        <div className="app-header-left">
          <h1>Betaflight PID AutoTune</h1>
          <span className="app-bf-compat">BF 4.3+</span>
        </div>
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
          <TuningWizard logId={activeLogId} mode={wizardMode} onExit={() => setActiveLogId(null)} onApplyComplete={handleApplyComplete} />
        ) : (
          <div className="main-content">
            <div className={`top-row ${isConnected && currentProfile ? 'top-row-connected' : ''}`}>
              <ConnectionPanel />
              {isConnected && currentProfile && <ProfileSelector />}
            </div>
            {isConnected && currentProfile && tuning.session && (
              <TuningStatusBanner
                session={tuning.session}
                flashErased={erasedForPhase === tuning.session.phase}
                erasing={erasing}
                downloading={downloading}
                onAction={handleTuningAction}
                onViewGuide={(mode) => setShowFlightGuideMode(mode)}
                onReset={async () => {
                  try {
                    setErasedForPhase(null);
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
                      setErasedForPhase(null);
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
