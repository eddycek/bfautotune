import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionSelectStep } from './SessionSelectStep';
import type { BlackboxLogSession, BlackboxParseProgress, TimeSeries } from '@shared/types/blackbox.types';

const emptyTimeSeries: TimeSeries = { time: new Float64Array(), values: new Float64Array() };

const mockSession: BlackboxLogSession = {
  index: 0,
  corruptedFrameCount: 0,
  warnings: [],
  flightData: {
    durationSeconds: 45.2,
    frameCount: 9040,
    sampleRateHz: 200,
    gyro: [emptyTimeSeries, emptyTimeSeries, emptyTimeSeries],
    setpoint: [emptyTimeSeries, emptyTimeSeries, emptyTimeSeries, emptyTimeSeries],
    pidP: [emptyTimeSeries, emptyTimeSeries, emptyTimeSeries],
    pidI: [emptyTimeSeries, emptyTimeSeries, emptyTimeSeries],
    pidD: [emptyTimeSeries, emptyTimeSeries, emptyTimeSeries],
    pidF: [emptyTimeSeries, emptyTimeSeries, emptyTimeSeries],
    motor: [emptyTimeSeries, emptyTimeSeries, emptyTimeSeries, emptyTimeSeries],
    debug: [],
  },
  header: {
    product: 'Blackbox flight data recorder by Nicholas Sherlock',
    dataVersion: 2,
    firmwareType: 'Betaflight',
    firmwareRevision: '4.5.0 (abc123)',
    firmwareDate: '2024-01-01',
    boardInformation: 'STM32F405',
    logStartDatetime: '2024-01-01T00:00:00.000Z',
    craftName: 'Test Quad',
    iFieldDefs: [],
    pFieldDefs: [],
    sFieldDefs: [],
    gFieldDefs: [],
    iInterval: 32,
    pInterval: 1,
    pDenom: 1,
    minthrottle: 1070,
    maxthrottle: 2000,
    motorOutputRange: 0,
    vbatref: 4200,
    looptime: 125,
    gyroScale: 1,
    rawHeaders: new Map(),
  },
};

describe('SessionSelectStep', () => {
  it('shows parsing state with progress', () => {
    const parseProgress: BlackboxParseProgress = {
      bytesProcessed: 45000,
      totalBytes: 100000,
      currentSession: 0,
      percent: 45,
    };

    render(
      <SessionSelectStep
        sessions={null}
        parsing={true}
        parseProgress={parseProgress}
        parseError={null}
        parseLog={vi.fn()}
        sessionIndex={0}
        onSelectSession={vi.fn()}
      />
    );

    expect(screen.getByText('Parsing Blackbox Log')).toBeInTheDocument();
    expect(screen.getByText('Session 1')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('shows parse error with retry button', () => {
    render(
      <SessionSelectStep
        sessions={null}
        parsing={false}
        parseProgress={null}
        parseError="Failed to parse log file"
        parseLog={vi.fn()}
        sessionIndex={0}
        onSelectSession={vi.fn()}
      />
    );

    expect(screen.getByText('Parse Error')).toBeInTheDocument();
    expect(screen.getByText('Failed to parse log file')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows empty state when no sessions', () => {
    render(
      <SessionSelectStep
        sessions={[]}
        parsing={false}
        parseProgress={null}
        parseError={null}
        parseLog={vi.fn()}
        sessionIndex={0}
        onSelectSession={vi.fn()}
      />
    );

    expect(screen.getByText('No flight sessions found in this log.')).toBeInTheDocument();
  });

  it('renders session list with duration and frame count', () => {
    const sessions: BlackboxLogSession[] = [
      { ...mockSession, index: 0 },
      { ...mockSession, index: 1 },
    ];

    render(
      <SessionSelectStep
        sessions={sessions}
        parsing={false}
        parseProgress={null}
        parseError={null}
        parseLog={vi.fn()}
        sessionIndex={0}
        onSelectSession={vi.fn()}
      />
    );

    // Multiple sessions with same data, so check for multiple
    expect(screen.getAllByText('45.2s')).toHaveLength(2);
    expect(screen.getAllByText('9,040 frames')).toHaveLength(2);
    expect(screen.getAllByText('200 Hz')).toHaveLength(2);
  });

  it('clicking session calls onSelectSession', async () => {
    const user = userEvent.setup();
    const mockOnSelectSession = vi.fn();
    const sessions: BlackboxLogSession[] = [
      { ...mockSession, index: 0 },
      { ...mockSession, index: 1 },
    ];

    render(
      <SessionSelectStep
        sessions={sessions}
        parsing={false}
        parseProgress={null}
        parseError={null}
        parseLog={vi.fn()}
        sessionIndex={0}
        onSelectSession={mockOnSelectSession}
      />
    );

    const sessionItems = screen.getAllByRole('button');
    await user.click(sessionItems[0]);

    expect(mockOnSelectSession).toHaveBeenCalledWith(1); // Reversed, so index 1
  });

  it('sessions rendered in reverse order (newest first)', () => {
    const sessions: BlackboxLogSession[] = [
      { ...mockSession, index: 0 },
      { ...mockSession, index: 1 },
      { ...mockSession, index: 2 },
    ];

    render(
      <SessionSelectStep
        sessions={sessions}
        parsing={false}
        parseProgress={null}
        parseError={null}
        parseLog={vi.fn()}
        sessionIndex={0}
        onSelectSession={vi.fn()}
      />
    );

    const sessionTitles = screen.getAllByText(/^Session \d+$/);
    expect(sessionTitles[0]).toHaveTextContent('Session 3');
    expect(sessionTitles[1]).toHaveTextContent('Session 2');
    expect(sessionTitles[2]).toHaveTextContent('Session 1');
  });

  it('auto-triggers parseLog on mount when no sessions/parsing/error', async () => {
    const mockParseLog = vi.fn().mockResolvedValue(undefined);

    render(
      <SessionSelectStep
        sessions={null}
        parsing={false}
        parseProgress={null}
        parseError={null}
        parseLog={mockParseLog}
        sessionIndex={0}
        onSelectSession={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockParseLog).toHaveBeenCalled();
    });
  });

  it('retry button calls parseLog', async () => {
    const user = userEvent.setup();
    const mockParseLog = vi.fn().mockResolvedValue(undefined);

    render(
      <SessionSelectStep
        sessions={null}
        parsing={false}
        parseProgress={null}
        parseError="Failed to parse"
        parseLog={mockParseLog}
        sessionIndex={0}
        onSelectSession={vi.fn()}
      />
    );

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    await user.click(retryButton);

    expect(mockParseLog).toHaveBeenCalled();
  });
});
