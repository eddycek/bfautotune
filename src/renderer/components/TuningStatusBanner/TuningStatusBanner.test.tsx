import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TuningStatusBanner } from './TuningStatusBanner';
import type { TuningSession } from '@shared/types/tuning.types';

const baseSession: TuningSession = {
  profileId: 'profile-1',
  phase: 'filter_flight_pending',
  startedAt: '2026-02-10T10:00:00Z',
  updatedAt: '2026-02-10T10:00:00Z',
};

describe('TuningStatusBanner', () => {
  const onAction = vi.fn();
  const onViewGuide = vi.fn();
  const onReset = vi.fn();

  function renderBanner(session: TuningSession = baseSession, flashErased?: boolean) {
    return render(
      <TuningStatusBanner
        session={session}
        flashErased={flashErased}
        onAction={onAction}
        onViewGuide={onViewGuide}
        onReset={onReset}
      />
    );
  }

  it('renders step indicators', () => {
    renderBanner();

    expect(screen.getByText('Prepare')).toBeInTheDocument();
    expect(screen.getByText('Filter Test Flight')).toBeInTheDocument();
    expect(screen.getByText('Filter Tune')).toBeInTheDocument();
    expect(screen.getByText('PID Test Flight')).toBeInTheDocument();
    expect(screen.getByText('PID Tune')).toBeInTheDocument();
  });

  it('shows filter_flight_pending UI', () => {
    renderBanner();

    expect(screen.getByText(/Erase Blackbox data, then fly the filter test flight/)).toBeInTheDocument();
    expect(screen.getByText('Erase Flash')).toBeInTheDocument();
    expect(screen.getByText('View Flight Guide')).toBeInTheDocument();
  });

  it('shows filter_analysis UI', () => {
    renderBanner({ ...baseSession, phase: 'filter_analysis' });

    expect(screen.getByText(/Run the Filter Wizard/)).toBeInTheDocument();
    expect(screen.getByText('Open Filter Wizard')).toBeInTheDocument();
  });

  it('shows pid_flight_pending UI', () => {
    renderBanner({ ...baseSession, phase: 'pid_flight_pending' });

    expect(screen.getByText(/fly the PID test flight/)).toBeInTheDocument();
    expect(screen.getByText('Erase Flash')).toBeInTheDocument();
    expect(screen.getByText('View Flight Guide')).toBeInTheDocument();
  });

  it('shows pid_analysis UI', () => {
    renderBanner({ ...baseSession, phase: 'pid_analysis' });

    expect(screen.getByText(/Run the PID Wizard/)).toBeInTheDocument();
    expect(screen.getByText('Open PID Wizard')).toBeInTheDocument();
  });

  it('shows completed UI', () => {
    renderBanner({ ...baseSession, phase: 'completed' });

    expect(screen.getByText(/Tuning complete/)).toBeInTheDocument();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
  });

  it('calls onAction with correct action when primary button clicked', async () => {
    const user = userEvent.setup();
    renderBanner({ ...baseSession, phase: 'filter_analysis' });

    await user.click(screen.getByText('Open Filter Wizard'));
    expect(onAction).toHaveBeenCalledWith('open_filter_wizard');
  });

  it('calls onViewGuide when View Flight Guide clicked', async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(screen.getByText('View Flight Guide'));
    expect(onViewGuide).toHaveBeenCalledWith('filter');
  });

  it('calls onViewGuide with pid mode for pid phases', async () => {
    const user = userEvent.setup();
    renderBanner({ ...baseSession, phase: 'pid_flight_pending' });

    await user.click(screen.getByText('View Flight Guide'));
    expect(onViewGuide).toHaveBeenCalledWith('pid');
  });

  it('calls onReset when Reset Session clicked', async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(screen.getByText('Reset Session'));
    expect(onReset).toHaveBeenCalled();
  });

  it('does not show View Flight Guide for phases without guideTip', () => {
    renderBanner({ ...baseSession, phase: 'filter_analysis' });

    expect(screen.queryByText('View Flight Guide')).not.toBeInTheDocument();
  });

  it('shows download log button for filter_log_ready', async () => {
    const user = userEvent.setup();
    renderBanner({ ...baseSession, phase: 'filter_log_ready' });

    expect(screen.getByText(/Download the Blackbox log/)).toBeInTheDocument();
    await user.click(screen.getByText('Download Log'));
    expect(onAction).toHaveBeenCalledWith('download_log');
  });

  it('shows download log button for pid_log_ready', async () => {
    const user = userEvent.setup();
    renderBanner({ ...baseSession, phase: 'pid_log_ready' });

    expect(screen.getByText(/Download the Blackbox log/)).toBeInTheDocument();
    await user.click(screen.getByText('Download Log'));
    expect(onAction).toHaveBeenCalledWith('download_log');
  });

  it('shows flash erased state for filter_flight_pending', async () => {
    const user = userEvent.setup();
    renderBanner(baseSession, true);

    expect(screen.getByText(/Flash erased! Disconnect your drone and fly the filter test flight/)).toBeInTheDocument();
    // Primary button should be "View Flight Guide", not "Erase Flash"
    expect(screen.queryByText('Erase Flash')).not.toBeInTheDocument();
    const guideBtn = screen.getByText('View Flight Guide');
    expect(guideBtn.className).toContain('wizard-btn-primary');
    await user.click(guideBtn);
    expect(onViewGuide).toHaveBeenCalledWith('filter');
  });

  it('advances step indicator after flash erased in filter_flight_pending', () => {
    const { container } = renderBanner(baseSession, true);

    // "Prepare" (step 1) should be done (checkmark), "Filter Flight" (step 2) should be current
    const steps = container.querySelectorAll('.tuning-status-step');
    expect(steps[0].className).toContain('done');
    expect(steps[1].className).toContain('current');
  });

  it('shows flash erased state for pid_flight_pending', async () => {
    const user = userEvent.setup();
    renderBanner({ ...baseSession, phase: 'pid_flight_pending' }, true);

    expect(screen.getByText(/Flash erased! Disconnect your drone and fly the PID test flight/)).toBeInTheDocument();
    expect(screen.queryByText('Erase Flash')).not.toBeInTheDocument();
    const guideBtn = screen.getByText('View Flight Guide');
    await user.click(guideBtn);
    expect(onViewGuide).toHaveBeenCalledWith('pid');
  });

  it('does not show flash erased state when flashErased is false', () => {
    renderBanner(baseSession, false);

    expect(screen.getByText('Erase Flash')).toBeInTheDocument();
    expect(screen.queryByText(/Flash erased!/)).not.toBeInTheDocument();
  });

  it('does not show flash erased state for non-flight-pending phases', () => {
    renderBanner({ ...baseSession, phase: 'filter_analysis' }, true);

    expect(screen.queryByText(/Flash erased!/)).not.toBeInTheDocument();
    expect(screen.getByText('Open Filter Wizard')).toBeInTheDocument();
  });

  it('shows downloading state when downloading prop is true', () => {
    render(
      <TuningStatusBanner
        session={{ ...baseSession, phase: 'filter_log_ready' }}
        onAction={onAction}
        onViewGuide={onViewGuide}
        onReset={onReset}
        downloading
      />
    );

    expect(screen.getByText('Downloading...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Downloading/ })).toBeDisabled();
  });

  it('disables primary button when downloading', () => {
    render(
      <TuningStatusBanner
        session={{ ...baseSession, phase: 'pid_log_ready' }}
        onAction={onAction}
        onViewGuide={onViewGuide}
        onReset={onReset}
        downloading
      />
    );

    expect(screen.getByRole('button', { name: /Downloading/ })).toBeDisabled();
  });

  it('shows filter_applied UI with Continue button and PID guide', async () => {
    const user = userEvent.setup();
    renderBanner({ ...baseSession, phase: 'filter_applied' });

    expect(screen.getByText(/Filters applied/)).toBeInTheDocument();
    expect(screen.getByText('Continue')).toBeInTheDocument();
    expect(screen.getByText('View Flight Guide')).toBeInTheDocument();

    await user.click(screen.getByText('Continue'));
    expect(onAction).toHaveBeenCalledWith('erase_flash');
  });

  it('shows pid_applied UI with Complete Tuning button', async () => {
    const user = userEvent.setup();
    renderBanner({ ...baseSession, phase: 'pid_applied' });

    expect(screen.getByText(/PIDs applied/)).toBeInTheDocument();
    expect(screen.getByText('Complete Tuning')).toBeInTheDocument();

    await user.click(screen.getByText('Complete Tuning'));
    expect(onAction).toHaveBeenCalledWith('complete_session');
  });
});
