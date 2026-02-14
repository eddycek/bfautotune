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
    expect(screen.getByText('Throttle Sweep')).toBeInTheDocument();
    expect(screen.getByText('Final Hover')).toBeInTheDocument();
  });

  it('shows PID flight guide phases', () => {
    render(<TuningWorkflowModal onClose={onClose} />);
    expect(screen.getByText('Roll Snaps')).toBeInTheDocument();
    expect(screen.getByText('Pitch Snaps')).toBeInTheDocument();
    expect(screen.getByText('Yaw Snaps')).toBeInTheDocument();
  });

  it('shows tips for both guides', () => {
    render(<TuningWorkflowModal onClose={onClose} />);
    const tipHeaders = screen.getAllByText('Tips');
    expect(tipHeaders.length).toBe(2);
    const altitudeTips = screen.getAllByText('Stay at 2–5 meters altitude');
    expect(altitudeTips.length).toBe(2);
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
});
