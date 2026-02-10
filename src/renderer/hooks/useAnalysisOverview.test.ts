import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAnalysisOverview } from './useAnalysisOverview';
import type { BlackboxParseResult, BlackboxLogSession } from '@shared/types/blackbox.types';
import type { FilterAnalysisResult, PIDAnalysisResult } from '@shared/types/analysis.types';

const mockSession: BlackboxLogSession = {
  index: 0,
  header: {
    product: 'Blackbox flight data recorder',
    dataVersion: 2,
    firmwareType: 'Betaflight',
    firmwareRevision: '4.4.0',
    firmwareDate: '2023-01-01',
    boardInformation: 'STM32F405',
    logStartDatetime: '2023-06-15T10:30:00Z',
    craftName: 'TestQuad',
    iFieldDefs: [],
    pFieldDefs: [],
    sFieldDefs: [],
    gFieldDefs: [],
    iInterval: 32,
    pInterval: 1,
    pDenom: 1,
    minthrottle: 1070,
    maxthrottle: 2000,
    motorOutputRange: 930,
    vbatref: 420,
    looptime: 125,
    gyroScale: 1,
    rawHeaders: new Map(),
  },
  flightData: {
    gyro: [
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
    ],
    setpoint: [
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
    ],
    pidP: [
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
    ],
    pidI: [
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
    ],
    pidD: [
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
    ],
    pidF: [
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
    ],
    motor: [
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
      { time: new Float64Array([0]), values: new Float64Array([0]) },
    ],
    debug: [],
    sampleRateHz: 8000,
    durationSeconds: 60,
    frameCount: 480000,
  },
  corruptedFrameCount: 0,
  warnings: [],
};

const mockParseResult: BlackboxParseResult = {
  sessions: [mockSession],
  fileSize: 1024 * 1024,
  parseTimeMs: 250,
  success: true,
};

const mockMultiSessionResult: BlackboxParseResult = {
  sessions: [
    mockSession,
    { ...mockSession, index: 1 },
  ],
  fileSize: 2 * 1024 * 1024,
  parseTimeMs: 400,
  success: true,
};

const mockFilterResult: FilterAnalysisResult = {
  noise: {
    roll: {
      spectrum: { frequencies: new Float64Array([100]), magnitudes: new Float64Array([-20]) },
      noiseFloorDb: -40,
      peaks: [],
    },
    pitch: {
      spectrum: { frequencies: new Float64Array([100]), magnitudes: new Float64Array([-20]) },
      noiseFloorDb: -40,
      peaks: [],
    },
    yaw: {
      spectrum: { frequencies: new Float64Array([100]), magnitudes: new Float64Array([-20]) },
      noiseFloorDb: -40,
      peaks: [],
    },
    overallLevel: 'low',
  },
  recommendations: [
    {
      setting: 'gyro_lpf1_static_hz',
      currentValue: 250,
      recommendedValue: 300,
      reason: 'Low noise — raising cutoff reduces latency.',
      impact: 'latency',
      confidence: 'high',
    },
  ],
  summary: 'Low noise detected. Filters can be relaxed for better response.',
  analysisTimeMs: 150,
  sessionIndex: 0,
  segmentsUsed: 3,
};

const mockPIDResult: PIDAnalysisResult = {
  roll: { responses: [], meanOvershoot: 5, meanRiseTimeMs: 20, meanSettlingTimeMs: 50, meanLatencyMs: 8 },
  pitch: { responses: [], meanOvershoot: 8, meanRiseTimeMs: 22, meanSettlingTimeMs: 55, meanLatencyMs: 9 },
  yaw: { responses: [], meanOvershoot: 3, meanRiseTimeMs: 30, meanSettlingTimeMs: 60, meanLatencyMs: 10 },
  recommendations: [
    {
      setting: 'pid_roll_p',
      currentValue: 45,
      recommendedValue: 50,
      reason: 'Slightly slow response — increasing P will sharpen stick feel.',
      impact: 'response',
      confidence: 'high',
    },
  ],
  summary: 'Good overall response. Minor P increase recommended for roll.',
  analysisTimeMs: 200,
  sessionIndex: 0,
  stepsDetected: 12,
  currentPIDs: {
    roll: { P: 45, I: 80, D: 30 },
    pitch: { P: 47, I: 84, D: 32 },
    yaw: { P: 45, I: 80, D: 0 },
  },
};

describe('useAnalysisOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-parses on mount', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockParseResult);
    vi.mocked(window.betaflight.analyzeFilters).mockResolvedValue(mockFilterResult);
    vi.mocked(window.betaflight.analyzePID).mockResolvedValue(mockPIDResult);

    renderHook(() => useAnalysisOverview('log-1'));

    await waitFor(() => {
      expect(window.betaflight.parseBlackboxLog).toHaveBeenCalledWith('log-1', expect.any(Function));
    });
  });

  it('auto-runs both analyses after single-session parse', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockParseResult);
    vi.mocked(window.betaflight.analyzeFilters).mockResolvedValue(mockFilterResult);
    vi.mocked(window.betaflight.analyzePID).mockResolvedValue(mockPIDResult);

    const { result } = renderHook(() => useAnalysisOverview('log-1'));

    await waitFor(() => {
      expect(result.current.filterResult).toEqual(mockFilterResult);
    });

    await waitFor(() => {
      expect(result.current.pidResult).toEqual(mockPIDResult);
    });

    expect(window.betaflight.analyzeFilters).toHaveBeenCalledWith('log-1', 0, undefined, expect.any(Function));
    expect(window.betaflight.analyzePID).toHaveBeenCalledWith('log-1', 0, undefined, expect.any(Function));
  });

  it('does not auto-run analyses for multi-session parse (waits for selection)', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockMultiSessionResult);

    const { result } = renderHook(() => useAnalysisOverview('log-1'));

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });

    expect(window.betaflight.analyzeFilters).not.toHaveBeenCalled();
    expect(window.betaflight.analyzePID).not.toHaveBeenCalled();
  });

  it('runs both analyses when session is selected in multi-session log', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockMultiSessionResult);
    vi.mocked(window.betaflight.analyzeFilters).mockResolvedValue(mockFilterResult);
    vi.mocked(window.betaflight.analyzePID).mockResolvedValue(mockPIDResult);

    const { result } = renderHook(() => useAnalysisOverview('log-1'));

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });

    await act(async () => {
      result.current.setSessionIndex(1);
    });

    await waitFor(() => {
      expect(window.betaflight.analyzeFilters).toHaveBeenCalledWith('log-1', 1, undefined, expect.any(Function));
      expect(window.betaflight.analyzePID).toHaveBeenCalledWith('log-1', 1, undefined, expect.any(Function));
    });
  });

  it('handles parse error', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockRejectedValue(
      new Error('Corrupt log file')
    );

    const { result } = renderHook(() => useAnalysisOverview('log-1'));

    await waitFor(() => {
      expect(result.current.parseError).toBe('Corrupt log file');
    });

    expect(result.current.parsing).toBe(false);
    expect(result.current.sessions).toBeNull();
  });

  it('handles filter analysis error independently', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockParseResult);
    vi.mocked(window.betaflight.analyzeFilters).mockRejectedValue(
      new Error('Not enough hover data')
    );
    vi.mocked(window.betaflight.analyzePID).mockResolvedValue(mockPIDResult);

    const { result } = renderHook(() => useAnalysisOverview('log-1'));

    await waitFor(() => {
      expect(result.current.filterError).toBe('Not enough hover data');
    });

    await waitFor(() => {
      expect(result.current.pidResult).toEqual(mockPIDResult);
    });
  });

  it('handles PID analysis error independently', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockParseResult);
    vi.mocked(window.betaflight.analyzeFilters).mockResolvedValue(mockFilterResult);
    vi.mocked(window.betaflight.analyzePID).mockRejectedValue(
      new Error('No step inputs found')
    );

    const { result } = renderHook(() => useAnalysisOverview('log-1'));

    await waitFor(() => {
      expect(result.current.pidError).toBe('No step inputs found');
    });

    await waitFor(() => {
      expect(result.current.filterResult).toEqual(mockFilterResult);
    });
  });

  it('retryParse re-triggers parsing', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockParseResult);
    vi.mocked(window.betaflight.analyzeFilters).mockResolvedValue(mockFilterResult);
    vi.mocked(window.betaflight.analyzePID).mockResolvedValue(mockPIDResult);

    const { result } = renderHook(() => useAnalysisOverview('log-1'));

    await waitFor(() => {
      expect(result.current.parseError).toBe('Network error');
    });

    await act(async () => {
      result.current.retryParse();
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    expect(result.current.parseError).toBeNull();
  });

  it('retryFilterAnalysis re-runs filter analysis', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockParseResult);
    vi.mocked(window.betaflight.analyzeFilters)
      .mockRejectedValueOnce(new Error('Temp error'))
      .mockResolvedValueOnce(mockFilterResult);
    vi.mocked(window.betaflight.analyzePID).mockResolvedValue(mockPIDResult);

    const { result } = renderHook(() => useAnalysisOverview('log-1'));

    await waitFor(() => {
      expect(result.current.filterError).toBe('Temp error');
    });

    await act(async () => {
      result.current.retryFilterAnalysis();
    });

    await waitFor(() => {
      expect(result.current.filterResult).toEqual(mockFilterResult);
    });

    expect(result.current.filterError).toBeNull();
  });

  it('retryPIDAnalysis re-runs PID analysis', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockParseResult);
    vi.mocked(window.betaflight.analyzeFilters).mockResolvedValue(mockFilterResult);
    vi.mocked(window.betaflight.analyzePID)
      .mockRejectedValueOnce(new Error('Temp error'))
      .mockResolvedValueOnce(mockPIDResult);

    const { result } = renderHook(() => useAnalysisOverview('log-1'));

    await waitFor(() => {
      expect(result.current.pidError).toBe('Temp error');
    });

    await act(async () => {
      result.current.retryPIDAnalysis();
    });

    await waitFor(() => {
      expect(result.current.pidResult).toEqual(mockPIDResult);
    });

    expect(result.current.pidError).toBeNull();
  });

  it('exposes logId', () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockParseResult);
    vi.mocked(window.betaflight.analyzeFilters).mockResolvedValue(mockFilterResult);
    vi.mocked(window.betaflight.analyzePID).mockResolvedValue(mockPIDResult);

    const { result } = renderHook(() => useAnalysisOverview('log-42'));
    expect(result.current.logId).toBe('log-42');
  });

  it('handles parse result with no sessions', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue({
      sessions: [],
      fileSize: 100,
      parseTimeMs: 10,
      success: false,
      error: 'No valid sessions',
    });

    const { result } = renderHook(() => useAnalysisOverview('log-1'));

    await waitFor(() => {
      expect(result.current.parseError).toBe('No valid sessions');
    });

    expect(result.current.sessions).toBeNull();
  });
});
