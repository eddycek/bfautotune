import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FCInfoDisplay } from './FCInfoDisplay';
import type { FCInfo } from '@shared/types/common.types';

describe('FCInfoDisplay', () => {
  const mockFCInfo: FCInfo = {
    variant: 'BTFL',
    version: '4.4.0',
    target: 'MATEKF405',
    boardName: 'MATEKF405',
    apiVersion: {
      protocol: 1,
      major: 12,
      minor: 0
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(window.betaflight.getConnectionStatus).mockImplementation(() =>
      Promise.resolve({
        connected: true,
        portPath: '/dev/ttyUSB0',
        fcInfo: mockFCInfo
      })
    );
    vi.mocked(window.betaflight.onConnectionChanged).mockReturnValue(() => {});
    vi.mocked(window.betaflight.getFCInfo).mockImplementation(() => Promise.resolve(mockFCInfo));

    // Mock exportCLI with format parameter
    vi.mocked(window.betaflight.exportCLI).mockImplementation((format: 'diff' | 'dump') => {
      if (format === 'diff') {
        return Promise.resolve('set motor_pwm_protocol = DSHOT600');
      } else {
        return Promise.resolve('# dump\nset motor_pwm_protocol = DSHOT600');
      }
    });

    // Default: blackbox settings return good values
    vi.mocked(window.betaflight.getBlackboxSettings).mockResolvedValue({
      debugMode: 'GYRO_SCALED',
      sampleRate: 1,
      loggingRateHz: 4000
    });
  });

  it('renders nothing when not connected', () => {
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: false
    });

    const { container } = render(<FCInfoDisplay />);
    expect(container.firstChild).toBeNull();
  });

  it('displays FC info title when connected', async () => {
    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('Flight Controller Information')).toBeInTheDocument();
    });
  });

  it('displays all FC info fields', async () => {
    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('Variant:')).toBeInTheDocument();
      expect(screen.getByText('BTFL')).toBeInTheDocument();
      expect(screen.getByText('Version:')).toBeInTheDocument();
      expect(screen.getByText('4.4.0')).toBeInTheDocument();
      expect(screen.getByText('Target:')).toBeInTheDocument();
      expect(screen.getByText('MATEKF405')).toBeInTheDocument();
      expect(screen.getByText('API Version:')).toBeInTheDocument();
      expect(screen.getByText('1.12.0')).toBeInTheDocument();
    });
  });

  it('hides board name when same as target', async () => {
    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('Target:')).toBeInTheDocument();
    });

    // Board label should not appear when boardName === target
    const boardLabels = screen.queryAllByText('Board:');
    expect(boardLabels.length).toBe(0);
  });

  it('shows board name when different from target', async () => {
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: true,
      portPath: '/dev/ttyUSB0',
      fcInfo: {
        ...mockFCInfo,
        boardName: 'Custom Board Name'
      }
    });

    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('Board:')).toBeInTheDocument();
      expect(screen.getByText('Custom Board Name')).toBeInTheDocument();
    });
  });

  it('displays export buttons', async () => {
    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('Export CLI Diff')).toBeInTheDocument();
      expect(screen.getByText('Export CLI Dump')).toBeInTheDocument();
    });
  });

  it('calls exportCLI when diff button clicked', async () => {
    const user = userEvent.setup();

    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('Export CLI Diff')).toBeInTheDocument();
    }, { timeout: 3000 });

    const diffButton = screen.getByText('Export CLI Diff');
    await user.click(diffButton);

    await waitFor(() => {
      expect(window.betaflight.exportCLI).toHaveBeenCalledWith('diff');
    });
  });

  it('calls exportCLI when dump button clicked', async () => {
    const user = userEvent.setup();

    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('Export CLI Dump')).toBeInTheDocument();
    }, { timeout: 3000 });

    const dumpButton = screen.getByText('Export CLI Dump');
    await user.click(dumpButton);

    await waitFor(() => {
      expect(window.betaflight.exportCLI).toHaveBeenCalledWith('dump');
    });
  });

  it('shows loading state', async () => {
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: true,
      portPath: '/dev/ttyUSB0'
    });
    vi.mocked(window.betaflight.getFCInfo).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockFCInfo), 100))
    );

    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('Loading FC information...')).toBeInTheDocument();
    });
  });

  it('displays error message when fetch fails', async () => {
    const errorMessage = 'Failed to get FC info';
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: true,
      portPath: '/dev/ttyUSB0'
    });
    vi.mocked(window.betaflight.getFCInfo).mockRejectedValue(new Error(errorMessage));

    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('fetches FC info when connected without fcInfo in status', async () => {
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: true,
      portPath: '/dev/ttyUSB0'
    });

    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(window.betaflight.getFCInfo).toHaveBeenCalled();
    });
  });

  it('uses fcInfo from connection status when available', async () => {
    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('BTFL')).toBeInTheDocument();
    });

    // Should NOT call getFCInfo when fcInfo already in status
    expect(window.betaflight.getFCInfo).not.toHaveBeenCalled();
  });

  // Blackbox settings diagnostics tests

  it('displays blackbox debug mode when GYRO_SCALED', async () => {
    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('Debug Mode:')).toBeInTheDocument();
      expect(screen.getByText('GYRO_SCALED')).toBeInTheDocument();
    });
  });

  it('displays logging rate', async () => {
    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('Logging Rate:')).toBeInTheDocument();
      expect(screen.getByText('4 kHz')).toBeInTheDocument();
    });
  });

  it('shows checkmark for correct debug mode', async () => {
    const { container } = render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('GYRO_SCALED')).toBeInTheDocument();
    });

    const debugSetting = container.querySelector('.fc-bb-setting.ok');
    expect(debugSetting).not.toBeNull();
  });

  it('shows warning for wrong debug mode', async () => {
    vi.mocked(window.betaflight.getBlackboxSettings).mockResolvedValue({
      debugMode: 'NONE',
      sampleRate: 0,
      loggingRateHz: 8000
    });

    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('NONE')).toBeInTheDocument();
      expect(screen.getByText(/debug_mode = GYRO_SCALED/)).toBeInTheDocument();
    });
  });

  it('shows warning for low logging rate', async () => {
    vi.mocked(window.betaflight.getBlackboxSettings).mockResolvedValue({
      debugMode: 'GYRO_SCALED',
      sampleRate: 3,
      loggingRateHz: 1000
    });

    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('1 kHz')).toBeInTheDocument();
      expect(screen.getByText(/Increase logging rate/)).toBeInTheDocument();
    });
  });

  it('calls getBlackboxSettings on mount when connected', async () => {
    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(window.betaflight.getBlackboxSettings).toHaveBeenCalled();
    });
  });

  it('handles getBlackboxSettings failure gracefully', async () => {
    vi.mocked(window.betaflight.getBlackboxSettings).mockRejectedValue(new Error('CLI failed'));

    render(<FCInfoDisplay />);

    await waitFor(() => {
      expect(screen.getByText('BTFL')).toBeInTheDocument();
    });

    // Should still render FC info without blackbox settings
    expect(screen.queryByText('Debug Mode:')).not.toBeInTheDocument();
  });
});
