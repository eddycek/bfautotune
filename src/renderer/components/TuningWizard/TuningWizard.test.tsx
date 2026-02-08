import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TuningWizard } from './TuningWizard';
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

const mockSingleSessionResult: BlackboxParseResult = {
  sessions: [mockSession],
  fileSize: 1024 * 1024,
  parseTimeMs: 250,
  success: true,
};

const mockMultiSessionResult: BlackboxParseResult = {
  sessions: [
    mockSession,
    { ...mockSession, index: 1, flightData: { ...mockSession.flightData, durationSeconds: 45, frameCount: 360000 } },
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
  summary: 'Low noise detected. Filters can be relaxed.',
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
  summary: 'Good overall response. Minor P increase recommended.',
  analysisTimeMs: 200,
  sessionIndex: 0,
  stepsDetected: 12,
  currentPIDs: {
    roll: { P: 45, I: 80, D: 30 },
    pitch: { P: 47, I: 84, D: 32 },
    yaw: { P: 45, I: 80, D: 0 },
  },
};

describe('TuningWizard', () => {
  const onExit = vi.fn();
  const GUIDE_BUTTON = 'Got it — Start Analysis';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Click through the guide step to advance to session/parse */
  async function passGuide(user: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => {
      expect(screen.getByText('Test Flight Guide')).toBeInTheDocument();
    });
    await user.click(screen.getByText(GUIDE_BUTTON));
  }

  it('renders wizard header with log ID and exit button', () => {
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    expect(screen.getByText('Tuning Wizard')).toBeInTheDocument();
    expect(screen.getByText('Log: test-log-1')).toBeInTheDocument();
    expect(screen.getByText('Exit')).toBeInTheDocument();
  });

  it('calls onExit when Exit button is clicked', async () => {
    const user = userEvent.setup();
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    await user.click(screen.getByText('Exit'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('shows test flight guide as first step', () => {
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    expect(screen.getByText('Test Flight Guide')).toBeInTheDocument();
    expect(screen.getByText('Take off & Hover')).toBeInTheDocument();
    expect(screen.getByText('Roll Snaps')).toBeInTheDocument();
    expect(screen.getByText(GUIDE_BUTTON)).toBeInTheDocument();
  });

  it('advances to session step when guide is acknowledged', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockImplementation(
      () => new Promise(() => {})
    );

    const user = userEvent.setup();
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    await passGuide(user);

    await waitFor(() => {
      expect(screen.getByText('Parsing Blackbox Log')).toBeInTheDocument();
    });
  });

  it('shows progress bar during parsing', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockImplementation(
      () => new Promise(() => {})
    );

    const user = userEvent.setup();
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    await passGuide(user);

    await waitFor(() => {
      expect(screen.getByText('Parsing Blackbox Log')).toBeInTheDocument();
    });
  });

  it('auto-advances to filter step for single session log', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockSingleSessionResult);

    const user = userEvent.setup();
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    await passGuide(user);

    await waitFor(() => {
      expect(screen.getByText('Filter Analysis')).toBeInTheDocument();
      expect(screen.getByText('Run Filter Analysis')).toBeInTheDocument();
    });
  });

  it('shows session selection for multi-session log', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockMultiSessionResult);

    const user = userEvent.setup();
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    await passGuide(user);

    await waitFor(() => {
      expect(screen.getByText('Select Flight Session')).toBeInTheDocument();
      expect(screen.getByText('Session 1')).toBeInTheDocument();
      expect(screen.getByText('Session 2')).toBeInTheDocument();
    });
  });

  it('navigates from session selection to filter step', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockMultiSessionResult);

    const user = userEvent.setup();
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    await passGuide(user);

    await waitFor(() => {
      expect(screen.getByText('Session 1')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Session 1'));

    await waitFor(() => {
      expect(screen.getByText('Run Filter Analysis')).toBeInTheDocument();
    });
  });

  it('runs filter analysis and shows results', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockSingleSessionResult);
    vi.mocked(window.betaflight.analyzeFilters).mockResolvedValue(mockFilterResult);

    const user = userEvent.setup();
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    await passGuide(user);

    await waitFor(() => {
      expect(screen.getByText('Run Filter Analysis')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Run Filter Analysis'));

    await waitFor(() => {
      expect(screen.getByText('Filter Analysis Results')).toBeInTheDocument();
      expect(screen.getByText('gyro_lpf1_static_hz')).toBeInTheDocument();
      expect(screen.getByText('250')).toBeInTheDocument();
      expect(screen.getByText('300')).toBeInTheDocument();
    });
  });

  it('navigates from filter results to PID step', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockSingleSessionResult);
    vi.mocked(window.betaflight.analyzeFilters).mockResolvedValue(mockFilterResult);

    const user = userEvent.setup();
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    await passGuide(user);

    await waitFor(() => {
      expect(screen.getByText('Run Filter Analysis')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Run Filter Analysis'));

    await waitFor(() => {
      expect(screen.getByText('Continue to PID Analysis')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Continue to PID Analysis'));

    await waitFor(() => {
      expect(screen.getByText('PID Analysis')).toBeInTheDocument();
      expect(screen.getByText('Run PID Analysis')).toBeInTheDocument();
    });
  });

  it('runs PID analysis and shows results with axis summary', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockSingleSessionResult);
    vi.mocked(window.betaflight.analyzeFilters).mockResolvedValue(mockFilterResult);
    vi.mocked(window.betaflight.analyzePID).mockResolvedValue(mockPIDResult);

    const user = userEvent.setup();
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    await passGuide(user);

    // Auto-advance to filter
    await waitFor(() => {
      expect(screen.getByText('Run Filter Analysis')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Run Filter Analysis'));

    // Navigate to PID
    await waitFor(() => {
      expect(screen.getByText('Continue to PID Analysis')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Continue to PID Analysis'));

    // Run PID analysis
    await waitFor(() => {
      expect(screen.getByText('Run PID Analysis')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Run PID Analysis'));

    await waitFor(() => {
      expect(screen.getByText('PID Analysis Results')).toBeInTheDocument();
      expect(screen.getByText('12 step inputs detected across all axes.')).toBeInTheDocument();
      expect(screen.getByText('pid_roll_p')).toBeInTheDocument();
    });
  });

  it('reaches summary step with all recommendations', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockSingleSessionResult);
    vi.mocked(window.betaflight.analyzeFilters).mockResolvedValue(mockFilterResult);
    vi.mocked(window.betaflight.analyzePID).mockResolvedValue(mockPIDResult);

    const user = userEvent.setup();
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    await passGuide(user);

    // Navigate through all steps
    await waitFor(() => expect(screen.getByText('Run Filter Analysis')).toBeInTheDocument());
    await user.click(screen.getByText('Run Filter Analysis'));
    await waitFor(() => expect(screen.getByText('Continue to PID Analysis')).toBeInTheDocument());
    await user.click(screen.getByText('Continue to PID Analysis'));
    await waitFor(() => expect(screen.getByText('Run PID Analysis')).toBeInTheDocument());
    await user.click(screen.getByText('Run PID Analysis'));
    await waitFor(() => expect(screen.getByText('Continue to Summary')).toBeInTheDocument());
    await user.click(screen.getByText('Continue to Summary'));

    // Summary step
    await waitFor(() => {
      expect(screen.getByText('Tuning Summary')).toBeInTheDocument();
      expect(screen.getByText('Filter Recommendations')).toBeInTheDocument();
      expect(screen.getByText('PID Recommendations')).toBeInTheDocument();
      expect(screen.getByText('Apply Changes (Coming Soon)')).toBeInTheDocument();
    });
  });

  it('shows parse error and allows retry', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog)
      .mockRejectedValueOnce(new Error('File not found'))
      .mockResolvedValueOnce(mockSingleSessionResult);

    const user = userEvent.setup();
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    await passGuide(user);

    await waitFor(() => {
      expect(screen.getByText('File not found')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Run Filter Analysis')).toBeInTheDocument();
    });
  });

  it('shows filter analysis error with retry and skip options', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(mockSingleSessionResult);
    vi.mocked(window.betaflight.analyzeFilters).mockRejectedValue(
      new Error('Not enough hover data')
    );

    const user = userEvent.setup();
    render(<TuningWizard logId="test-log-1" onExit={onExit} />);

    await passGuide(user);

    await waitFor(() => expect(screen.getByText('Run Filter Analysis')).toBeInTheDocument());
    await user.click(screen.getByText('Run Filter Analysis'));

    await waitFor(() => {
      expect(screen.getByText('Not enough hover data')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.getByText('Skip to PIDs')).toBeInTheDocument();
    });
  });
});
