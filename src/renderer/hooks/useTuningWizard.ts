import { useState, useCallback, useEffect } from 'react';
import type { BlackboxLogSession, BlackboxParseProgress } from '@shared/types/blackbox.types';
import type {
  FilterAnalysisResult,
  PIDAnalysisResult,
  AnalysisProgress,
} from '@shared/types/analysis.types';
import type {
  ApplyRecommendationsProgress,
  ApplyRecommendationsResult,
} from '@shared/types/ipc.types';
import type { TuningMode } from '@shared/types/tuning.types';
import { markIntentionalDisconnect } from './useConnection';

export type ApplyState = 'idle' | 'confirming' | 'applying' | 'done' | 'error';

export type WizardStep = 'guide' | 'session' | 'filter' | 'pid' | 'summary';

export interface UseTuningWizardReturn {
  mode: TuningMode;
  step: WizardStep;
  setStep: (step: WizardStep) => void;
  logId: string;
  sessionIndex: number;
  selectSession: (idx: number) => void;
  sessionSelected: boolean;
  sessions: BlackboxLogSession[] | null;

  // Parse
  parsing: boolean;
  parseProgress: BlackboxParseProgress | null;
  parseError: string | null;
  parseLog: () => Promise<void>;

  // Filter analysis
  filterResult: FilterAnalysisResult | null;
  filterAnalyzing: boolean;
  filterProgress: AnalysisProgress | null;
  filterError: string | null;
  runFilterAnalysis: () => Promise<void>;

  // PID analysis
  pidResult: PIDAnalysisResult | null;
  pidAnalyzing: boolean;
  pidProgress: AnalysisProgress | null;
  pidError: string | null;
  runPIDAnalysis: () => Promise<void>;

  // Apply
  applyState: ApplyState;
  applyProgress: ApplyRecommendationsProgress | null;
  applyResult: ApplyRecommendationsResult | null;
  applyError: string | null;
  startApply: () => void;
  confirmApply: (createSnapshot: boolean) => Promise<void>;
  cancelApply: () => void;
}

export function useTuningWizard(logId: string, mode: TuningMode = 'full'): UseTuningWizardReturn {
  // Skip guide for filter/pid modes — wizard opens from tuning session where flight is already done
  const [step, setStep] = useState<WizardStep>(mode === 'full' ? 'guide' : 'session');
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionSelected, setSessionSelected] = useState(false);
  const [sessions, setSessions] = useState<BlackboxLogSession[] | null>(null);

  // Parse state
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState<BlackboxParseProgress | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Filter analysis state
  const [filterResult, setFilterResult] = useState<FilterAnalysisResult | null>(null);
  const [filterAnalyzing, setFilterAnalyzing] = useState(false);
  const [filterProgress, setFilterProgress] = useState<AnalysisProgress | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);

  // PID analysis state
  const [pidResult, setPidResult] = useState<PIDAnalysisResult | null>(null);
  const [pidAnalyzing, setPidAnalyzing] = useState(false);
  const [pidProgress, setPidProgress] = useState<AnalysisProgress | null>(null);
  const [pidError, setPidError] = useState<string | null>(null);

  // Apply state
  const [applyState, setApplyState] = useState<ApplyState>('idle');
  const [applyProgress, setApplyProgress] = useState<ApplyRecommendationsProgress | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyRecommendationsResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const selectSession = useCallback((idx: number) => {
    setSessionIndex(idx);
    setSessionSelected(true);
  }, []);

  const parseLog = useCallback(async () => {
    setParsing(true);
    setParseProgress(null);
    setParseError(null);

    try {
      const result = await window.betaflight.parseBlackboxLog(logId, (progress) => {
        setParseProgress(progress);
      });

      if (!result.success || result.sessions.length === 0) {
        setParseError(result.error || 'No flight sessions found in log');
        return;
      }

      setSessions(result.sessions);

      // Auto-advance if single session
      if (result.sessions.length === 1) {
        setSessionIndex(0);
        setSessionSelected(true);
        // Skip to the correct step based on mode
        if (mode === 'pid') {
          setStep('pid');
        } else {
          setStep('filter');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse log';
      setParseError(message);
    } finally {
      setParsing(false);
    }
  }, [logId]);

  const runFilterAnalysis = useCallback(async () => {
    setFilterAnalyzing(true);
    setFilterProgress(null);
    setFilterError(null);

    try {
      const result = await window.betaflight.analyzeFilters(
        logId,
        sessionIndex,
        undefined,
        (progress) => {
          setFilterProgress(progress);
        }
      );

      setFilterResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze filters';
      setFilterError(message);
    } finally {
      setFilterAnalyzing(false);
    }
  }, [logId, sessionIndex]);

  const runPIDAnalysis = useCallback(async () => {
    setPidAnalyzing(true);
    setPidProgress(null);
    setPidError(null);

    try {
      const result = await window.betaflight.analyzePID(
        logId,
        sessionIndex,
        undefined,
        (progress) => {
          setPidProgress(progress);
        }
      );

      setPidResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze PIDs';
      setPidError(message);
    } finally {
      setPidAnalyzing(false);
    }
  }, [logId, sessionIndex]);

  // Subscribe to apply progress events
  useEffect(() => {
    const cleanup = window.betaflight.onApplyProgress((progress) => {
      setApplyProgress(progress);
    });
    return cleanup;
  }, []);

  const startApply = useCallback(() => {
    setApplyState('confirming');
  }, []);

  const cancelApply = useCallback(() => {
    setApplyState('idle');
  }, []);

  const confirmApply = useCallback(
    async (createSnapshot: boolean) => {
      setApplyState('applying');
      setApplyProgress(null);
      setApplyError(null);
      setApplyResult(null);

      // Mark the upcoming disconnect as intentional so useConnection
      // shows "Disconnected" instead of "FC disconnected unexpectedly"
      markIntentionalDisconnect();

      try {
        // In mode-specific modes, only send relevant recommendations
        const filterRecs = mode === 'pid' ? [] : (filterResult?.recommendations ?? []);
        const allPidRecs = mode === 'filter' ? [] : (pidResult?.recommendations ?? []);
        const pidRecs = allPidRecs.filter((r) => r.setting.startsWith('pid_'));
        const ffRecs = allPidRecs.filter((r) => r.setting.startsWith('feedforward_'));

        const result = await window.betaflight.applyRecommendations({
          filterRecommendations: filterRecs,
          pidRecommendations: pidRecs,
          feedforwardRecommendations: ffRecs,
          createSnapshot,
        });

        setApplyResult(result);
        setApplyState('done');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to apply recommendations';
        setApplyError(message);
        setApplyState('error');
      }
    },
    [filterResult, pidResult]
  );

  return {
    mode,
    step,
    setStep,
    logId,
    sessionIndex,
    selectSession,
    sessionSelected,
    sessions,
    parsing,
    parseProgress,
    parseError,
    parseLog,
    filterResult,
    filterAnalyzing,
    filterProgress,
    filterError,
    runFilterAnalysis,
    pidResult,
    pidAnalyzing,
    pidProgress,
    pidError,
    runPIDAnalysis,
    applyState,
    applyProgress,
    applyResult,
    applyError,
    startApply,
    confirmApply,
    cancelApply,
  };
}
