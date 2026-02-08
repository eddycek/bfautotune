import { describe, it, expect, vi } from 'vitest';
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

  it('shows all 8 workflow steps', () => {
    render(<TuningWorkflowModal onClose={onClose} />);
    expect(screen.getByText('Connect your drone')).toBeInTheDocument();
    expect(screen.getByText('Create a backup')).toBeInTheDocument();
    expect(screen.getByText('Erase Blackbox data')).toBeInTheDocument();
    expect(screen.getByText('Fly the test flight')).toBeInTheDocument();
    expect(screen.getByText('Download the Blackbox log')).toBeInTheDocument();
    expect(screen.getByText('Analyze the data')).toBeInTheDocument();
    expect(screen.getByText('Apply changes')).toBeInTheDocument();
    expect(screen.getByText('Repeat')).toBeInTheDocument();
  });

  it('shows flight guide phases', () => {
    render(<TuningWorkflowModal onClose={onClose} />);
    expect(screen.getByText('Take off & Hover')).toBeInTheDocument();
    expect(screen.getByText('Roll Snaps')).toBeInTheDocument();
    expect(screen.getByText('Pitch Snaps')).toBeInTheDocument();
    expect(screen.getByText('Yaw Snaps')).toBeInTheDocument();
    expect(screen.getByText('Final Hover')).toBeInTheDocument();
    expect(screen.getByText('Land')).toBeInTheDocument();
  });

  it('shows tips', () => {
    render(<TuningWorkflowModal onClose={onClose} />);
    expect(screen.getByText('Tips')).toBeInTheDocument();
    expect(screen.getByText('Stay at 2–5 meters altitude')).toBeInTheDocument();
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
