import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BlackboxStatus } from './BlackboxStatus';
import type { BlackboxInfo } from '@shared/types/blackbox.types';

describe('BlackboxStatus', () => {
  const mockBlackboxInfoSupported: BlackboxInfo = {
    supported: true,
    storageType: 'flash',
    totalSize: 16 * 1024 * 1024, // 16 MB
    usedSize: 8 * 1024 * 1024, // 8 MB
    hasLogs: true,
    freeSize: 8 * 1024 * 1024, // 8 MB
    usagePercent: 50
  };

  const mockBlackboxInfoEmpty: BlackboxInfo = {
    supported: true,
    storageType: 'flash',
    totalSize: 16 * 1024 * 1024,
    usedSize: 0,
    hasLogs: false,
    freeSize: 16 * 1024 * 1024,
    usagePercent: 0
  };

  const mockBlackboxInfoNotSupported: BlackboxInfo = {
    supported: false,
    storageType: 'none',
    totalSize: 0,
    usedSize: 0,
    hasLogs: false,
    freeSize: 0,
    usagePercent: 0
  };

  const mockSDCardInfo: BlackboxInfo = {
    supported: true,
    storageType: 'sdcard',
    totalSize: 32 * 1024 * 1024 * 1024, // 32 GB
    usedSize: 28 * 1024 * 1024 * 1024, // 28 GB
    hasLogs: true,
    freeSize: 4 * 1024 * 1024 * 1024, // 4 GB
    usagePercent: 87
  };

  const mockSDCardNotReady: BlackboxInfo = {
    supported: true,
    storageType: 'sdcard',
    totalSize: 0,
    usedSize: 0,
    hasLogs: false,
    freeSize: 0,
    usagePercent: 0
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(window.betaflight.getBlackboxInfo).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<BlackboxStatus />);

    expect(screen.getByText('Blackbox Storage')).toBeInTheDocument();
    expect(screen.getByText('Loading Blackbox info...')).toBeInTheDocument();
  });

  it('displays Blackbox info when supported and has logs', async () => {
    vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockBlackboxInfoSupported);

    render(<BlackboxStatus />);

    await waitFor(() => {
      expect(screen.getByText('Blackbox Storage')).toBeInTheDocument();
    });

    // Check storage stats
    expect(screen.getByText('16.00 MB')).toBeInTheDocument(); // Total (unique)
    const usedAndFree = screen.getAllByText('8.00 MB'); // Used and Free (same value)
    expect(usedAndFree).toHaveLength(2);
    expect(screen.getByText('50%')).toBeInTheDocument(); // Usage

    // Check logs available message
    expect(screen.getByText('Logs available for download')).toBeInTheDocument();
  });

  it('displays no logs message when storage is empty', async () => {
    vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockBlackboxInfoEmpty);

    render(<BlackboxStatus />);

    await waitFor(() => {
      expect(screen.getByText('No logs recorded yet')).toBeInTheDocument();
    });
  });

  it('displays not supported message when Blackbox not available', async () => {
    vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockBlackboxInfoNotSupported);

    render(<BlackboxStatus />);

    await waitFor(() => {
      expect(screen.getByText(/Blackbox not supported/i)).toBeInTheDocument();
    });
  });

  it('displays error message on fetch failure', async () => {
    vi.mocked(window.betaflight.getBlackboxInfo).mockRejectedValue(
      new Error('Failed to get Blackbox info')
    );

    render(<BlackboxStatus />);

    await waitFor(() => {
      expect(screen.getByText('Failed to get Blackbox info')).toBeInTheDocument();
    });
  });

  it('formats bytes correctly', async () => {
    const largeStorageInfo: BlackboxInfo = {
      supported: true,
      storageType: 'flash',
      totalSize: 128 * 1024 * 1024, // 128 MB
      usedSize: 64 * 1024 * 1024, // 64 MB
      hasLogs: true,
      freeSize: 64 * 1024 * 1024,
      usagePercent: 50
    };

    vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(largeStorageInfo);

    render(<BlackboxStatus />);

    await waitFor(() => {
      expect(screen.getByText('128.00 MB')).toBeInTheDocument();
      const usedAndFree = screen.getAllByText('64.00 MB'); // Used and Free (same value)
      expect(usedAndFree).toHaveLength(2);
    });
  });

  it('shows correct usage indicator color for low usage', async () => {
    const lowUsageInfo: BlackboxInfo = {
      ...mockBlackboxInfoSupported,
      usedSize: 4 * 1024 * 1024, // 4 MB
      freeSize: 12 * 1024 * 1024, // 12 MB
      usagePercent: 25
    };

    vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(lowUsageInfo);

    render(<BlackboxStatus />);

    await waitFor(() => {
      const indicator = document.querySelector('.usage-indicator.low');
      expect(indicator).toBeInTheDocument();
    });
  });

  it('shows correct usage indicator color for high usage', async () => {
    const highUsageInfo: BlackboxInfo = {
      ...mockBlackboxInfoSupported,
      usedSize: 14 * 1024 * 1024, // 14 MB
      freeSize: 2 * 1024 * 1024, // 2 MB
      usagePercent: 87
    };

    vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(highUsageInfo);

    render(<BlackboxStatus />);

    await waitFor(() => {
      const indicator = document.querySelector('.usage-indicator.high');
      expect(indicator).toBeInTheDocument();
    });
  });

  it('calls getBlackboxInfo on mount', async () => {
    vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockBlackboxInfoSupported);

    render(<BlackboxStatus />);

    await waitFor(() => {
      expect(window.betaflight.getBlackboxInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe('SD card storage', () => {
    it('shows SD Card label in header when storageType is sdcard', async () => {
      vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockSDCardInfo);

      render(<BlackboxStatus />);

      await waitFor(() => {
        expect(screen.getByText(/SD Card/)).toBeInTheDocument();
      });
    });

    it('shows storage stats for SD card', async () => {
      vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockSDCardInfo);

      render(<BlackboxStatus />);

      await waitFor(() => {
        expect(screen.getByText('32.00 GB')).toBeInTheDocument(); // Total
        expect(screen.getByText('87%')).toBeInTheDocument(); // Usage
      });
    });

    it('shows SD card not ready message when state is not ready', async () => {
      vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockSDCardNotReady);

      render(<BlackboxStatus />);

      await waitFor(() => {
        expect(screen.getByText('SD card not ready')).toBeInTheDocument();
      });
    });

    it('shows Erase Logs instead of Erase Flash for SD card', async () => {
      vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockSDCardInfo);

      render(<BlackboxStatus />);

      await waitFor(() => {
        expect(screen.getByText('Erase Logs')).toBeInTheDocument();
      });

      expect(screen.queryByText('Erase Flash')).not.toBeInTheDocument();
    });

    it('hides Test Read button for SD card', async () => {
      vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockSDCardInfo);

      render(<BlackboxStatus />);

      await waitFor(() => {
        expect(screen.getByText('Download Logs')).toBeInTheDocument();
      });

      expect(screen.queryByText('Test Read (Debug)')).not.toBeInTheDocument();
    });

    it('shows Download Logs button for SD card', async () => {
      vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockSDCardInfo);

      render(<BlackboxStatus />);

      await waitFor(() => {
        expect(screen.getByText('Download Logs')).toBeInTheDocument();
      });
    });
  });

  describe('readonly mode', () => {
    const mockLog = {
      id: 'log-1',
      filename: 'blackbox_2026-02-09.bbl',
      filepath: '/tmp/blackbox_2026-02-09.bbl',
      timestamp: '2026-02-09T12:00:00Z',
      size: 6 * 1024 * 1024,
      fcInfo: { variant: 'BTFL', version: '4.5.0' },
    };

    it('hides Download, Erase, and Test Read buttons when readonly', async () => {
      vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockBlackboxInfoSupported);

      render(<BlackboxStatus readonly />);

      await waitFor(() => {
        expect(screen.getByText('Logs available for download')).toBeInTheDocument();
      });

      expect(screen.queryByText('Download Logs')).not.toBeInTheDocument();
      expect(screen.queryByText('Erase Flash')).not.toBeInTheDocument();
      expect(screen.queryByText('Test Read (Debug)')).not.toBeInTheDocument();
    });

    it('shows Download, Erase, and Test Read buttons when not readonly', async () => {
      vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockBlackboxInfoSupported);

      render(<BlackboxStatus />);

      await waitFor(() => {
        expect(screen.getByText('Download Logs')).toBeInTheDocument();
      });

      expect(screen.getByText('Erase Flash')).toBeInTheDocument();
      expect(screen.getByText('Test Read (Debug)')).toBeInTheDocument();
    });

    it('still shows storage stats in readonly mode', async () => {
      vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockBlackboxInfoSupported);

      render(<BlackboxStatus readonly />);

      await waitFor(() => {
        expect(screen.getByText('16.00 MB')).toBeInTheDocument();
      });

      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('hides Analyze button on logs when readonly', async () => {
      vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockBlackboxInfoSupported);
      vi.mocked(window.betaflight.listBlackboxLogs).mockResolvedValue([mockLog]);
      const onAnalyze = vi.fn();

      render(<BlackboxStatus onAnalyze={onAnalyze} readonly />);

      await waitFor(() => {
        expect(screen.getByText('blackbox_2026-02-09.bbl')).toBeInTheDocument();
      });

      expect(screen.queryByText('Analyze')).not.toBeInTheDocument();
    });

    it('shows Analyze button on logs when not readonly', async () => {
      vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockBlackboxInfoSupported);
      vi.mocked(window.betaflight.listBlackboxLogs).mockResolvedValue([mockLog]);
      const onAnalyze = vi.fn();

      render(<BlackboxStatus onAnalyze={onAnalyze} />);

      await waitFor(() => {
        expect(screen.getByText('blackbox_2026-02-09.bbl')).toBeInTheDocument();
      });

      expect(screen.getByText('Analyze')).toBeInTheDocument();
    });

    it('calls onAnalyze with log id and filename', async () => {
      vi.mocked(window.betaflight.getBlackboxInfo).mockResolvedValue(mockBlackboxInfoSupported);
      vi.mocked(window.betaflight.listBlackboxLogs).mockResolvedValue([mockLog]);
      const onAnalyze = vi.fn();
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      render(<BlackboxStatus onAnalyze={onAnalyze} />);

      await waitFor(() => {
        expect(screen.getByText('blackbox_2026-02-09.bbl')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Analyze'));

      expect(onAnalyze).toHaveBeenCalledWith('log-1', 'blackbox_2026-02-09.bbl');
    });
  });
});
