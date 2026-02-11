import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnapshotDiffModal } from './SnapshotDiffModal';
import type { ConfigurationSnapshot } from '@shared/types/common.types';

function makeSnapshot(overrides: Partial<ConfigurationSnapshot> & { id: string; label: string; cliDiff: string }): ConfigurationSnapshot {
  return {
    id: overrides.id,
    timestamp: new Date().toISOString(),
    label: overrides.label,
    type: 'manual',
    fcInfo: {
      variant: 'BTFL',
      version: '4.4.0',
      target: 'MATEKF405',
      boardName: 'MATEKF405',
      apiVersion: { protocol: 1, major: 12, minor: 0 },
    },
    configuration: { cliDiff: overrides.cliDiff },
    metadata: { appVersion: '0.1.0', createdBy: 'user' },
    ...overrides,
    configuration: { cliDiff: overrides.cliDiff },
  };
}

describe('SnapshotDiffModal', () => {
  const snapshotA = makeSnapshot({
    id: 'a',
    label: 'Before tune',
    cliDiff: 'set gyro_lpf1_static_hz = 150\nset dterm_lpf1_static_hz = 100\nfeature GPS',
  });

  const snapshotB = makeSnapshot({
    id: 'b',
    label: 'After tune',
    cliDiff: 'set gyro_lpf1_static_hz = 200\nset dterm_lpf1_static_hz = 100\nfeature TELEMETRY',
  });

  it('renders modal title', () => {
    render(<SnapshotDiffModal snapshotA={snapshotA} snapshotB={snapshotB} onClose={vi.fn()} />);
    expect(screen.getByText('Snapshot Comparison')).toBeInTheDocument();
  });

  it('displays snapshot labels', () => {
    render(<SnapshotDiffModal snapshotA={snapshotA} snapshotB={snapshotB} onClose={vi.fn()} />);
    expect(screen.getByText('Before tune')).toBeInTheDocument();
    expect(screen.getByText('After tune')).toBeInTheDocument();
  });

  it('displays legend badges (Added and Changed only)', () => {
    render(<SnapshotDiffModal snapshotA={snapshotA} snapshotB={snapshotB} onClose={vi.fn()} />);
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(screen.queryByText('Removed')).not.toBeInTheDocument();
  });

  it('displays summary counts', () => {
    render(<SnapshotDiffModal snapshotA={snapshotA} snapshotB={snapshotB} onClose={vi.fn()} />);
    // gyro_lpf1 changed, feature GPS reverted to default (changed), feature TELEMETRY added = 1 added, 2 changed
    expect(screen.getByText('1 added, 2 changed')).toBeInTheDocument();
  });

  it('renders added lines with + prefix', () => {
    render(<SnapshotDiffModal snapshotA={snapshotA} snapshotB={snapshotB} onClose={vi.fn()} />);
    const addedLines = document.querySelectorAll('.diff-line-added');
    expect(addedLines.length).toBeGreaterThan(0);
    // feature TELEMETRY added
    const telemetryAdded = Array.from(addedLines).find(
      el => el.textContent?.includes('feature TELEMETRY')
    );
    expect(telemetryAdded).toBeTruthy();
  });

  it('shows (default) value for settings reverted to factory default', () => {
    render(<SnapshotDiffModal snapshotA={snapshotA} snapshotB={snapshotB} onClose={vi.fn()} />);
    // feature GPS was in snapshotA but not in snapshotB → shown as changed to (default)
    const changedNewLines = document.querySelectorAll('.diff-line-changed-new');
    const gpsDefault = Array.from(changedNewLines).find(
      el => el.textContent?.includes('feature GPS') && el.textContent?.includes('(default)')
    );
    expect(gpsDefault).toBeTruthy();
  });

  it('renders changed lines with old and new values', () => {
    render(<SnapshotDiffModal snapshotA={snapshotA} snapshotB={snapshotB} onClose={vi.fn()} />);
    const oldLines = document.querySelectorAll('.diff-line-changed-old');
    const newLines = document.querySelectorAll('.diff-line-changed-new');
    expect(oldLines.length).toBeGreaterThan(0);
    expect(newLines.length).toBeGreaterThan(0);
    // gyro_lpf1 changed 150 → 200
    const oldLine = Array.from(oldLines).find(el => el.textContent?.includes('150'));
    const newLine = Array.from(newLines).find(el => el.textContent?.includes('200'));
    expect(oldLine).toBeTruthy();
    expect(newLine).toBeTruthy();
  });

  it('shows empty state when snapshots are identical', () => {
    const identical = makeSnapshot({ id: 'c', label: 'Same', cliDiff: 'set x = 1' });
    const identical2 = makeSnapshot({ id: 'd', label: 'Same 2', cliDiff: 'set x = 1' });
    render(<SnapshotDiffModal snapshotA={identical} snapshotB={identical2} onClose={vi.fn()} />);
    expect(screen.getByText('Snapshots have identical configuration.')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SnapshotDiffModal snapshotA={snapshotA} snapshotB={snapshotB} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SnapshotDiffModal snapshotA={snapshotA} snapshotB={snapshotB} onClose={onClose} />);

    const overlay = document.querySelector('.snapshot-diff-overlay')!;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when modal content clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SnapshotDiffModal snapshotA={snapshotA} snapshotB={snapshotB} onClose={onClose} />);

    const modal = document.querySelector('.snapshot-diff-modal')!;
    await user.click(modal);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('groups diff entries by command type', () => {
    render(<SnapshotDiffModal snapshotA={snapshotA} snapshotB={snapshotB} onClose={vi.fn()} />);
    const groupTitles = document.querySelectorAll('.diff-group-title');
    const titles = Array.from(groupTitles).map(el => el.textContent);
    expect(titles).toContain('feature');
    expect(titles).toContain('set');
  });

  it('handles empty before snapshot (compare with empty)', () => {
    const empty = makeSnapshot({ id: 'e', label: 'Empty', cliDiff: '' });
    render(<SnapshotDiffModal snapshotA={empty} snapshotB={snapshotB} onClose={vi.fn()} />);
    // All entries in B should be "added"
    expect(screen.getByText(/3 added, 0 changed/)).toBeInTheDocument();
  });
});
