import { useState, useCallback } from 'react';
import type { BlackboxLogSession, BlackboxParseProgress } from '@shared/types/blackbox.types';
import type {
  FilterAnalysisResult,
  PIDAnalysisResult,
  AnalysisProgress
} from '@shared/types/analysis.types';

export type WizardStep = 'session' | 'filter' | 'pid' | 'summary';

export interface UseTuningWizardReturn {
  step: WizardStep;
  setStep: (step: WizardStep) => void;
  logId: string;
  sessionIndex: number;
  setSessionIndex: (idx: number) => void;
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
}

export function useTuningWizard(logId: string): UseTuningWizardReturn {
  const [step, setStep] = useState<WizardStep>('session');
  const [sessionIndex, setSessionIndex] = useState(0);
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
        setStep('filter');
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

  return {
    step,
    setStep,
    logId,
    sessionIndex,
    setSessionIndex,
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
  };
}
