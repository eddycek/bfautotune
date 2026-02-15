import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VerificationSessionModal } from './VerificationSessionModal';
import type { BlackboxParseResult, BlackboxLogSession } from '@shared/types/blackbox.types';

function makeSession(index: number, duration = 60, frames = 6000): BlackboxLogSession {
  return {
    index,
    header: {} as any,
    flightData: {
      gyro: [] as any,
      setpoint: [] as any,
      pidP: [] as any,
      pidI: [] as any,
      pidD: [] as any,
      pidF: [] as any,
      motor: [] as any,
      debug: [],
      sampleRateHz: 4000,
      durationSeconds: duration,
      frameCount: frames,
    },
    corruptedFrameCount: 0,
    warnings: [],
  };
}

describe('VerificationSessionModal', () => {
  const onAnalyze = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-analyzes for single session log', async () => {
    const result: BlackboxParseResult = {
      sessions: [makeSession(0)],
      fileSize: 1000,
      parseTimeMs: 50,
      success: true,
    };
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(result);

    render(<VerificationSessionModal logId="log-1" onAnalyze={onAnalyze} onCancel={onCancel} />);

    await waitFor(() => {
      expect(onAnalyze).toHaveBeenCalledWith(0);
    });
  });

  it('shows session list for multi-session log', async () => {
    const result: BlackboxParseResult = {
      sessions: [makeSession(0, 45, 4500), makeSession(1, 30, 3000), makeSession(2, 90, 9000)],
      fileSize: 5000,
      parseTimeMs: 100,
      success: true,
    };
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(result);

    render(<VerificationSessionModal logId="log-1" onAnalyze={onAnalyze} onCancel={onCancel} />);

    await waitFor(() => {
      expect(screen.getByText(/3 sessions/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Session 1/)).toBeInTheDocument();
    expect(screen.getByText(/Session 2/)).toBeInTheDocument();
    expect(screen.getByText(/Session 3/)).toBeInTheDocument();
  });

  it('calls onAnalyze with correct index on click', async () => {
    const user = userEvent.setup();
    const result: BlackboxParseResult = {
      sessions: [makeSession(0, 45), makeSession(1, 30)],
      fileSize: 3000,
      parseTimeMs: 80,
      success: true,
    };
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(result);

    render(<VerificationSessionModal logId="log-1" onAnalyze={onAnalyze} onCancel={onCancel} />);

    await waitFor(() => {
      expect(screen.getByText(/Session 2/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Session 2/));
    expect(onAnalyze).toHaveBeenCalledWith(1);
  });

  it('calls onCancel when Cancel clicked', async () => {
    const user = userEvent.setup();
    const result: BlackboxParseResult = {
      sessions: [makeSession(0), makeSession(1)],
      fileSize: 2000,
      parseTimeMs: 60,
      success: true,
    };
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(result);

    render(<VerificationSessionModal logId="log-1" onAnalyze={onAnalyze} onCancel={onCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows error state on parse failure', async () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockRejectedValue(new Error('Corrupt file'));

    render(<VerificationSessionModal logId="log-1" onAnalyze={onAnalyze} onCancel={onCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Corrupt file')).toBeInTheDocument();
    });

    expect(screen.getByText('Parse Error')).toBeInTheDocument();
  });

  it('shows parsing state initially', () => {
    vi.mocked(window.betaflight.parseBlackboxLog).mockReturnValue(new Promise(() => {}));

    render(<VerificationSessionModal logId="log-1" onAnalyze={onAnalyze} onCancel={onCancel} />);

    expect(screen.getByText('Parsing log...')).toBeInTheDocument();
  });

  it('shows sessions in reverse order (newest first)', async () => {
    const result: BlackboxParseResult = {
      sessions: [makeSession(0, 30, 3000), makeSession(1, 60, 6000), makeSession(2, 90, 9000)],
      fileSize: 5000,
      parseTimeMs: 100,
      success: true,
    };
    vi.mocked(window.betaflight.parseBlackboxLog).mockResolvedValue(result);

    render(<VerificationSessionModal logId="log-1" onAnalyze={onAnalyze} onCancel={onCancel} />);

    await waitFor(() => {
      expect(screen.getByText(/Session 3/)).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole('button').filter((b) => b.textContent?.includes('Session'));
    expect(buttons[0].textContent).toContain('Session 3');
    expect(buttons[1].textContent).toContain('Session 2');
    expect(buttons[2].textContent).toContain('Session 1');
  });
});
