import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TuningWorkflowModal } from './TuningWorkflowModal';

describe('TuningWorkflowModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title', () => {
    render(<TuningWorkflowModal onClose={onClose} />);
    expect(screen.getByText('How to Prepare Blackbox Data')).toBeInTheDocument();
  });

  it('shows all 10 workflow steps for two-flight process', () => {
    render(<TuningWorkflowModal onClose={onClose} />);
    expect(screen.getByText('Connect your drone')).toBeInTheDocument();
    expect(screen.getByText('Create a backup')).toBeInTheDocument();
    expect(screen.getByText('Check Blackbox setup')).toBeInTheDocument();
    expect(screen.getByText('Erase Blackbox data')).toBeInTheDocument();
    expect(screen.getByText('Fly: Filter test flight')).toBeInTheDocument();
    expect(screen.getByText('Analyze & apply filters')).toBeInTheDocument();
    expect(screen.getByText('Erase Blackbox data again')).toBeInTheDocument();
    expect(screen.getByText('Fly: PID test flight')).toBeInTheDocument();
    expect(screen.getByText('Analyze & apply PIDs')).toBeInTheDocument();
    expect(screen.getByText('Optional: Verification hover')).toBeInTheDocument();
  });

  it('shows all three flight guide sections', () => {
    render(<TuningWorkflowModal onClose={onClose} />);
    expect(screen.getByText('Flight 1: Filter Test Flight')).toBeInTheDocument();
    expect(screen.getByText('Flight 2: PID Test Flight')).toBeInTheDocument();
    expect(screen.getByText('Optional: Verification Hover')).toBeInTheDocument();
  });

  it('shows filter flight guide phases', () => {
    render(<TuningWorkflowModal onClose={onClose} />);
    // Throttle Sweep appears in both filter and verification guides
    expect(screen.getAllByText('Throttle Sweep').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Final Hover').length).toBeGreaterThanOrEqual(1);
  });

  it('shows PID flight guide phases', () => {
    render(<TuningWorkflowModal onClose={onClose} />);
    expect(screen.getByText('Roll Snaps')).toBeInTheDocument();
    expect(screen.getByText('Pitch Snaps')).toBeInTheDocument();
    expect(screen.getByText('Yaw Snaps')).toBeInTheDocument();
  });

  it('shows tips for all three guides', () => {
    render(<TuningWorkflowModal onClose={onClose} />);
    const tipHeaders = screen.getAllByText('Tips');
    expect(tipHeaders.length).toBe(3);
  });

  it('calls onClose when "Got it" is clicked', async () => {
    const user = userEvent.setup();
    render(<TuningWorkflowModal onClose={onClose} />);

    await user.click(screen.getByText('Got it'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay backdrop is clicked', async () => {
    const user = userEvent.setup();
    render(<TuningWorkflowModal onClose={onClose} />);

    // Click the overlay (the outermost element with the overlay class)
    const overlay = document.querySelector('.profile-wizard-overlay')!;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal content is clicked', async () => {
    const user = userEvent.setup();
    render(<TuningWorkflowModal onClose={onClose} />);

    const modal = document.querySelector('.profile-wizard-modal')!;
    await user.click(modal);
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('mode="filter"', () => {
    it('shows only filter workflow steps (1–6)', () => {
      render(<TuningWorkflowModal onClose={onClose} mode="filter" />);
      expect(screen.getByText('Connect your drone')).toBeInTheDocument();
      expect(screen.getByText('Create a backup')).toBeInTheDocument();
      expect(screen.getByText('Check Blackbox setup')).toBeInTheDocument();
      expect(screen.getByText('Erase Blackbox data')).toBeInTheDocument();
      expect(screen.getByText('Fly: Filter test flight')).toBeInTheDocument();
      expect(screen.getByText('Analyze & apply filters')).toBeInTheDocument();
      // PID and verification steps hidden
      expect(screen.queryByText('Erase Blackbox data again')).not.toBeInTheDocument();
      expect(screen.queryByText('Fly: PID test flight')).not.toBeInTheDocument();
      expect(screen.queryByText('Analyze & apply PIDs')).not.toBeInTheDocument();
      expect(screen.queryByText('Optional: Verification hover')).not.toBeInTheDocument();
    });

    it('shows only filter flight guide section', () => {
      render(<TuningWorkflowModal onClose={onClose} mode="filter" />);
      expect(screen.getByText('Flight 1: Filter Test Flight')).toBeInTheDocument();
      expect(screen.queryByText('Flight 2: PID Test Flight')).not.toBeInTheDocument();
      expect(screen.queryByText('Optional: Verification Hover')).not.toBeInTheDocument();
    });

    it('shows filter-specific subtitle', () => {
      render(<TuningWorkflowModal onClose={onClose} mode="filter" />);
      expect(
        screen.getByText('Follow these steps for the filter tuning flight.')
      ).toBeInTheDocument();
    });
  });

  describe('mode="pid"', () => {
    it('shows only PID workflow steps (7–9)', () => {
      render(<TuningWorkflowModal onClose={onClose} mode="pid" />);
      expect(screen.getByText('Erase Blackbox data again')).toBeInTheDocument();
      expect(screen.getByText('Fly: PID test flight')).toBeInTheDocument();
      expect(screen.getByText('Analyze & apply PIDs')).toBeInTheDocument();
      // Filter and verification steps hidden
      expect(screen.queryByText('Connect your drone')).not.toBeInTheDocument();
      expect(screen.queryByText('Create a backup')).not.toBeInTheDocument();
      expect(screen.queryByText('Fly: Filter test flight')).not.toBeInTheDocument();
      expect(screen.queryByText('Analyze & apply filters')).not.toBeInTheDocument();
      expect(screen.queryByText('Optional: Verification hover')).not.toBeInTheDocument();
    });

    it('shows only PID flight guide section', () => {
      render(<TuningWorkflowModal onClose={onClose} mode="pid" />);
      expect(screen.queryByText('Flight 1: Filter Test Flight')).not.toBeInTheDocument();
      expect(screen.getByText('Flight 2: PID Test Flight')).toBeInTheDocument();
      expect(screen.queryByText('Optional: Verification Hover')).not.toBeInTheDocument();
    });

    it('shows PID-specific subtitle', () => {
      render(<TuningWorkflowModal onClose={onClose} mode="pid" />);
      expect(screen.getByText('Follow these steps for the PID tuning flight.')).toBeInTheDocument();
    });
  });

  describe('mode="verification"', () => {
    it('shows verification title and subtitle', () => {
      render(<TuningWorkflowModal onClose={onClose} mode="verification" />);
      expect(screen.getByText('Verification Hover')).toBeInTheDocument();
      expect(
        screen.getByText('Fly a short hover to verify noise improvement after tuning.')
      ).toBeInTheDocument();
    });

    it('shows verification flight phases', () => {
      render(<TuningWorkflowModal onClose={onClose} mode="verification" />);
      expect(screen.getByText('Throttle Sweep')).toBeInTheDocument();
      expect(screen.getByText('Final Hover')).toBeInTheDocument();
    });

    it('does not show workflow steps or filter/PID guides', () => {
      render(<TuningWorkflowModal onClose={onClose} mode="verification" />);
      expect(screen.queryByText('Connect your drone')).not.toBeInTheDocument();
      expect(screen.queryByText('Flight 1: Filter Test Flight')).not.toBeInTheDocument();
      expect(screen.queryByText('Flight 2: PID Test Flight')).not.toBeInTheDocument();
    });

    it('shows verification-specific tips', () => {
      render(<TuningWorkflowModal onClose={onClose} mode="verification" />);
      expect(screen.getByText(/before\/after spectra/)).toBeInTheDocument();
    });
  });
});
