import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnapshotManager, _resetPersistedSnapshotsPage } from './SnapshotManager';
import type { SnapshotMetadata, ConfigurationSnapshot } from '@shared/types/common.types';
import type { SnapshotRestoreResult } from '@shared/types/ipc.types';

function makeMockSnapshot(index: number): SnapshotMetadata {
  const ts = new Date(2024, 0, 1);
  ts.setHours(index);
  return {
    id: `snapshot-gen-${index}`,
    timestamp: ts.toISOString(),
    label: `Snapshot ${index}`,
    type: 'manual',
    sizeBytes: 1024,
    fcInfo: { variant: 'BTFL', version: '4.4.0', boardName: 'MATEKF405' },
  };
}

describe('SnapshotManager', () => {
  const mockSnapshots: SnapshotMetadata[] = [
    {
      id: 'snapshot-1',
      timestamp: new Date('2024-01-01').toISOString(),
      label: 'Baseline',
      type: 'baseline',
      sizeBytes: 2048,
      fcInfo: {
        variant: 'BTFL',
        version: '4.4.0',
        boardName: 'MATEKF405'
      }
    },
    {
      id: 'snapshot-2',
      timestamp: new Date('2024-01-02').toISOString(),
      label: 'After PID tune',
      type: 'manual',
      sizeBytes: 3072,
      fcInfo: {
        variant: 'BTFL',
        version: '4.4.0',
        boardName: 'MATEKF405'
      }
    }
  ];

  const mockFullSnapshot: ConfigurationSnapshot = {
    id: 'snapshot-1',
    timestamp: new Date('2024-01-01').toISOString(),
    label: 'Baseline',
    type: 'baseline',
    fcInfo: {
      variant: 'BTFL',
      version: '4.4.0',
      target: 'MATEKF405',
      boardName: 'MATEKF405',
      apiVersion: { protocol: 1, major: 12, minor: 0 }
    },
    configuration: {
      cliDiff: 'set motor_pwm_protocol = DSHOT600'
    },
    metadata: {
      appVersion: '0.1.0',
      createdBy: 'user'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _resetPersistedSnapshotsPage();

    vi.mocked(window.betaflight.listSnapshots).mockResolvedValue(mockSnapshots);
    vi.mocked(window.betaflight.createSnapshot).mockResolvedValue(mockFullSnapshot);
    vi.mocked(window.betaflight.loadSnapshot).mockResolvedValue(mockFullSnapshot);
    vi.mocked(window.betaflight.deleteSnapshot).mockResolvedValue(undefined);
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: true,
      portPath: '/dev/ttyUSB0'
    });
    vi.mocked(window.betaflight.onConnectionChanged).mockReturnValue(() => {});
    vi.mocked(window.betaflight.restoreSnapshot).mockResolvedValue({
      success: true,
      backupSnapshotId: 'backup-1',
      appliedCommands: 3,
      rebooted: true
    } as SnapshotRestoreResult);
    vi.mocked(window.betaflight.onRestoreProgress).mockReturnValue(() => {});

    // Mock window.confirm
    global.confirm = vi.fn(() => true);
  });

  it('renders panel with title', () => {
    render(<SnapshotManager />);
    expect(screen.getByText('Configuration Snapshots')).toBeInTheDocument();
  });

  it('displays create snapshot button', () => {
    render(<SnapshotManager />);
    expect(screen.getByRole('button', { name: /create snapshot/i })).toBeInTheDocument();
  });

  it('loads and displays snapshots on mount', async () => {
    render(<SnapshotManager />);

    await waitFor(() => {
      // Check for snapshot labels - there are multiple "Baseline" texts so use getAllByText
      const baselineElements = screen.getAllByText(/Baseline/);
      expect(baselineElements.length).toBeGreaterThan(0);
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });
  });

  it('displays baseline badge for baseline snapshot', async () => {
    render(<SnapshotManager />);

    await waitFor(() => {
      const badge = document.querySelector('.badge.baseline');
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe('Baseline');
    });
  });

  it('shows empty state when no snapshots exist', async () => {
    vi.mocked(window.betaflight.listSnapshots).mockResolvedValue([]);

    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText(/No snapshots yet/i)).toBeInTheDocument();
    });
  });

  it('shows loading state', async () => {
    vi.mocked(window.betaflight.listSnapshots).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockSnapshots), 100))
    );

    render(<SnapshotManager />);

    expect(screen.getByText('Loading snapshots...')).toBeInTheDocument();
  });

  it('disables create button when not connected', () => {
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: false
    });

    render(<SnapshotManager />);

    const createButton = screen.getByRole('button', { name: /create snapshot/i });
    expect(createButton).toBeDisabled();
  });

  it('opens create dialog when create button clicked', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    const createButton = screen.getByRole('button', { name: /create snapshot/i });
    await user.click(createButton);

    expect(screen.getByRole('heading', { name: 'Create Snapshot' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/name.*optional/i)).toBeInTheDocument();
  });

  it('allows entering snapshot label in create dialog', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    const createButton = screen.getByRole('button', { name: /create snapshot/i });
    await user.click(createButton);

    const labelInput = screen.getByPlaceholderText(/name.*optional/i);
    await user.type(labelInput, 'My custom label');

    expect(screen.getByDisplayValue('My custom label')).toBeInTheDocument();
  });

  it('creates snapshot with label when create confirmed', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(window.betaflight.listSnapshots).toHaveBeenCalled();
    });

    const createButton = screen.getByRole('button', { name: /create snapshot/i });
    await user.click(createButton);

    const labelInput = screen.getByPlaceholderText(/name.*optional/i);
    await user.type(labelInput, 'My snapshot');

    const confirmButton = screen.getByRole('button', { name: /^create$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(window.betaflight.createSnapshot).toHaveBeenCalledWith('My snapshot');
    });
  });

  it('creates snapshot without label when none provided', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(window.betaflight.listSnapshots).toHaveBeenCalled();
    });

    const createButton = screen.getByRole('button', { name: /create snapshot/i });
    await user.click(createButton);

    const confirmButton = screen.getByRole('button', { name: /^create$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(window.betaflight.createSnapshot).toHaveBeenCalledWith(undefined);
    });
  });

  it('closes create dialog on cancel', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    const createButton = screen.getByRole('button', { name: /create snapshot/i });
    await user.click(createButton);

    expect(screen.getByRole('heading', { name: 'Create Snapshot' })).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Create Snapshot' })).not.toBeInTheDocument();
    });
  });

  it('closes create dialog after successful creation', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(window.betaflight.listSnapshots).toHaveBeenCalled();
    });

    const createButton = screen.getByRole('button', { name: /create snapshot/i });
    await user.click(createButton);

    const confirmButton = screen.getByRole('button', { name: /^create$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Create Snapshot' })).not.toBeInTheDocument();
    });
  });

  it('displays export button for each snapshot', async () => {
    render(<SnapshotManager />);

    await waitFor(() => {
      const exportButtons = screen.getAllByRole('button', { name: /export/i });
      expect(exportButtons.length).toBe(2); // One for each snapshot
    });
  });

  it('displays delete button only for non-baseline snapshots', async () => {
    render(<SnapshotManager />);

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      expect(deleteButtons.length).toBe(1); // Only for manual snapshot
    });
  });

  it('shows confirmation before deleting snapshot', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    expect(global.confirm).toHaveBeenCalledWith('Are you sure you want to delete this snapshot?');
  });

  it('deletes snapshot when confirmed', async () => {
    const user = userEvent.setup();
    global.confirm = vi.fn(() => true);

    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(window.betaflight.deleteSnapshot).toHaveBeenCalledWith('snapshot-2');
    });
  });

  it('does not delete snapshot when cancelled', async () => {
    const user = userEvent.setup();
    global.confirm = vi.fn(() => false);

    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    expect(window.betaflight.deleteSnapshot).not.toHaveBeenCalled();
  });

  it('loads and exports snapshot when export clicked', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      const snapshots = screen.getAllByRole('button', { name: /export/i });
      expect(snapshots.length).toBeGreaterThan(0);
    });

    const exportButtons = screen.getAllByRole('button', { name: /export/i });
    await user.click(exportButtons[0]);

    await waitFor(() => {
      expect(window.betaflight.loadSnapshot).toHaveBeenCalledWith('snapshot-1');
    });
  });

  it('displays FC version and size for each snapshot', async () => {
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getAllByText('BTFL 4.4.0').length).toBe(2);
      expect(screen.getByText('2.0 KB')).toBeInTheDocument();
      expect(screen.getByText('3.0 KB')).toBeInTheDocument();
    });
  });

  it('displays error message when loading fails', async () => {
    const errorMessage = 'Failed to load snapshots';
    vi.mocked(window.betaflight.listSnapshots).mockRejectedValue(new Error(errorMessage));

    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  // Restore tests
  it('displays restore button for each snapshot when connected', async () => {
    render(<SnapshotManager />);

    await waitFor(() => {
      const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
      expect(restoreButtons.length).toBe(2);
    });
  });

  it('disables restore buttons when not connected', async () => {
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: false
    });

    render(<SnapshotManager />);

    await waitFor(() => {
      const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
      restoreButtons.forEach(btn => expect(btn).toBeDisabled());
    });
  });

  it('shows restore confirmation dialog when restore clicked', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    await user.click(restoreButtons[0]);

    expect(screen.getByRole('heading', { name: 'Restore Snapshot' })).toBeInTheDocument();
    expect(screen.getByText(/This will restore FC configuration/)).toBeInTheDocument();
  });

  it('restore confirmation has backup checkbox checked by default', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    await user.click(restoreButtons[0]);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('calls restoreSnapshot with backup when confirmed', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    await user.click(restoreButtons[0]);

    // Find the dialog by its heading and get the confirm button within it
    const dialog = screen.getByRole('heading', { name: 'Restore Snapshot' }).closest('.create-dialog')!;
    const confirmButton = within(dialog as HTMLElement).getByRole('button', { name: /^restore$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(window.betaflight.restoreSnapshot).toHaveBeenCalledWith('snapshot-1', true);
    });
  });

  it('calls restoreSnapshot without backup when checkbox unchecked', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    await user.click(restoreButtons[0]);

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    const dialog = screen.getByRole('heading', { name: 'Restore Snapshot' }).closest('.create-dialog')!;
    const confirmButton = within(dialog as HTMLElement).getByRole('button', { name: /^restore$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(window.betaflight.restoreSnapshot).toHaveBeenCalledWith('snapshot-1', false);
    });
  });

  it('hides restore confirmation when cancel clicked', async () => {
    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    await user.click(restoreButtons[0]);

    expect(screen.getByRole('heading', { name: 'Restore Snapshot' })).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Restore Snapshot' })).not.toBeInTheDocument();
    });
  });

  it('shows error when restore fails', async () => {
    vi.mocked(window.betaflight.restoreSnapshot).mockRejectedValue(
      new Error('Snapshot contains no restorable settings')
    );

    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    await user.click(restoreButtons[0]);

    const dialog = screen.getByRole('heading', { name: 'Restore Snapshot' }).closest('.create-dialog')!;
    const confirmButton = within(dialog as HTMLElement).getByRole('button', { name: /^restore$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Snapshot contains no restorable settings')).toBeInTheDocument();
    });
  });

  // Numbering tests
  it('displays dynamic numbering for snapshots', async () => {
    render(<SnapshotManager />);

    await waitFor(() => {
      // snapshots are displayed newest-first: snapshot-1 (index 0), snapshot-2 (index 1)
      // #2 = newest (snapshots.length - 0), #1 = oldest (snapshots.length - 1)
      const numbers = document.querySelectorAll('.snapshot-number');
      expect(numbers).toHaveLength(2);
      expect(numbers[0].textContent).toBe('#2');
      expect(numbers[1].textContent).toBe('#1');
    });
  });

  it('numbering adjusts after snapshot deletion', async () => {
    // Start with 2 snapshots, then re-render with 1
    const { unmount } = render(<SnapshotManager />);

    await waitFor(() => {
      const numbers = document.querySelectorAll('.snapshot-number');
      expect(numbers).toHaveLength(2);
    });

    unmount();

    // Simulate one snapshot deleted
    vi.mocked(window.betaflight.listSnapshots).mockResolvedValue([mockSnapshots[0]]);
    render(<SnapshotManager />);

    await waitFor(() => {
      const numbers = document.querySelectorAll('.snapshot-number');
      expect(numbers).toHaveLength(1);
      expect(numbers[0].textContent).toBe('#1');
    });
  });

  // Compare tests
  it('displays compare button for each snapshot', async () => {
    render(<SnapshotManager />);

    await waitFor(() => {
      const compareButtons = screen.getAllByRole('button', { name: /^compare$/i });
      expect(compareButtons.length).toBe(2);
    });
  });

  it('loads both snapshots when compare clicked', async () => {
    const clickedSnapshot: ConfigurationSnapshot = {
      ...mockFullSnapshot,
      id: 'snapshot-1',
      label: 'Baseline',
      configuration: { cliDiff: 'set gyro_lpf1_static_hz = 150' },
    };
    const previousSnapshot: ConfigurationSnapshot = {
      ...mockFullSnapshot,
      id: 'snapshot-2',
      label: 'After PID tune',
      configuration: { cliDiff: 'set gyro_lpf1_static_hz = 200' },
    };

    // handleCompare(snapshot-1, 0): first loads snapshot-1, then loads snapshots[1].id = snapshot-2
    vi.mocked(window.betaflight.loadSnapshot)
      .mockResolvedValueOnce(clickedSnapshot)
      .mockResolvedValueOnce(previousSnapshot);

    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    // Click compare on snapshot-1 (index 0) — loads it + previous (snapshot-2 at index 1)
    const compareButtons = screen.getAllByRole('button', { name: /^compare$/i });
    await user.click(compareButtons[0]);

    await waitFor(() => {
      expect(window.betaflight.loadSnapshot).toHaveBeenCalledWith('snapshot-1');
      expect(window.betaflight.loadSnapshot).toHaveBeenCalledWith('snapshot-2');
    });
  });

  it('shows diff modal after loading snapshots', async () => {
    const clickedSnapshot: ConfigurationSnapshot = {
      ...mockFullSnapshot,
      id: 'snapshot-1',
      label: 'Baseline',
      configuration: { cliDiff: 'set gyro_lpf1_static_hz = 150' },
    };
    const previousSnapshot: ConfigurationSnapshot = {
      ...mockFullSnapshot,
      id: 'snapshot-2',
      label: 'After PID tune',
      configuration: { cliDiff: 'set gyro_lpf1_static_hz = 200' },
    };

    vi.mocked(window.betaflight.loadSnapshot)
      .mockResolvedValueOnce(clickedSnapshot)
      .mockResolvedValueOnce(previousSnapshot);

    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    const compareButtons = screen.getAllByRole('button', { name: /^compare$/i });
    await user.click(compareButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Snapshot Comparison')).toBeInTheDocument();
    });
  });

  it('compares oldest snapshot with empty config', async () => {
    const oldestSnapshot: ConfigurationSnapshot = {
      ...mockFullSnapshot,
      id: 'snapshot-2',
      label: 'After PID tune',
      configuration: { cliDiff: 'set gyro_lpf1_static_hz = 150' },
    };

    vi.mocked(window.betaflight.loadSnapshot).mockResolvedValueOnce(oldestSnapshot);

    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    // Click compare on snapshot-2 (index 1, last in array) — oldest, compare with empty
    const compareButtons = screen.getAllByRole('button', { name: /^compare$/i });
    await user.click(compareButtons[1]);

    await waitFor(() => {
      expect(screen.getByText('Snapshot Comparison')).toBeInTheDocument();
      // Only loaded one snapshot (the oldest), not two
      expect(window.betaflight.loadSnapshot).toHaveBeenCalledTimes(1);
    });
  });

  it('closes diff modal when close clicked', async () => {
    const clickedSnapshot: ConfigurationSnapshot = {
      ...mockFullSnapshot,
      id: 'snapshot-1',
      label: 'Baseline',
      configuration: { cliDiff: 'set gyro_lpf1_static_hz = 150' },
    };
    const previousSnapshot: ConfigurationSnapshot = {
      ...mockFullSnapshot,
      id: 'snapshot-2',
      label: 'After PID tune',
      configuration: { cliDiff: 'set gyro_lpf1_static_hz = 200' },
    };

    vi.mocked(window.betaflight.loadSnapshot)
      .mockResolvedValueOnce(clickedSnapshot)
      .mockResolvedValueOnce(previousSnapshot);

    const user = userEvent.setup();
    render(<SnapshotManager />);

    await waitFor(() => {
      expect(screen.getByText('After PID tune')).toBeInTheDocument();
    });

    const compareButtons = screen.getAllByRole('button', { name: /^compare$/i });
    await user.click(compareButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Snapshot Comparison')).toBeInTheDocument();
    });

    const closeButton = screen.getByRole('button', { name: /^close$/i });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('Snapshot Comparison')).not.toBeInTheDocument();
    });
  });

  // Pagination tests
  describe('pagination', () => {
    it('does not show pagination controls for fewer than 20 snapshots', async () => {
      // Default mockSnapshots has 2 items — no pagination
      render(<SnapshotManager />);

      await waitFor(() => {
        expect(screen.getByText('After PID tune')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    });

    it('shows pagination controls and 20 items per page for > 20 snapshots', async () => {
      const snapshots = Array.from({ length: 25 }, (_, i) => makeMockSnapshot(i + 1));
      vi.mocked(window.betaflight.listSnapshots).mockResolvedValue(snapshots);

      render(<SnapshotManager />);

      await waitFor(() => {
        expect(document.querySelectorAll('.snapshot-number')).toHaveLength(20);
      });

      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });

    it('navigates to page 2 with correct numbering', async () => {
      const snapshots = Array.from({ length: 25 }, (_, i) => makeMockSnapshot(i + 1));
      vi.mocked(window.betaflight.listSnapshots).mockResolvedValue(snapshots);
      const user = userEvent.setup();

      render(<SnapshotManager />);

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Next' }));

      await waitFor(() => {
        expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
      });

      // Page 2: items at global indices 20-24 → #5, #4, #3, #2, #1
      const numbers = document.querySelectorAll('.snapshot-number');
      expect(numbers).toHaveLength(5);
      expect(numbers[0].textContent).toBe('#5');
      expect(numbers[4].textContent).toBe('#1');
    });

    it('numbering accounts for pagination offset on page 1', async () => {
      const snapshots = Array.from({ length: 25 }, (_, i) => makeMockSnapshot(i + 1));
      vi.mocked(window.betaflight.listSnapshots).mockResolvedValue(snapshots);

      render(<SnapshotManager />);

      await waitFor(() => {
        const numbers = document.querySelectorAll('.snapshot-number');
        expect(numbers).toHaveLength(20);
        // First item on page 1: global index 0 → #25
        expect(numbers[0].textContent).toBe('#25');
        // Last item on page 1: global index 19 → #6
        expect(numbers[19].textContent).toBe('#6');
      });
    });

    it('persists page across unmount/remount', async () => {
      const snapshots = Array.from({ length: 25 }, (_, i) => makeMockSnapshot(i + 1));
      vi.mocked(window.betaflight.listSnapshots).mockResolvedValue(snapshots);
      const user = userEvent.setup();

      const { unmount } = render(<SnapshotManager />);

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Next' }));

      await waitFor(() => {
        expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
      });

      unmount();

      render(<SnapshotManager />);

      await waitFor(() => {
        expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
      });
    });

    it('clamps page when snapshot count decreases', async () => {
      const snapshots = Array.from({ length: 25 }, (_, i) => makeMockSnapshot(i + 1));
      vi.mocked(window.betaflight.listSnapshots).mockResolvedValue(snapshots);
      const user = userEvent.setup();

      const { unmount } = render(<SnapshotManager />);

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Next' }));

      await waitFor(() => {
        expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
      });

      unmount();

      // Fewer snapshots — only 1 page
      vi.mocked(window.betaflight.listSnapshots).mockResolvedValue([mockSnapshots[0]]);

      render(<SnapshotManager />);

      await waitFor(() => {
        const numbers = document.querySelectorAll('.snapshot-number');
        expect(numbers).toHaveLength(1);
        expect(numbers[0].textContent).toBe('#1');
      });

      expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    });
  });
});
