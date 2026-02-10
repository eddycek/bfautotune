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

  function renderBanner(session: TuningSession = baseSession) {
    return render(
      <TuningStatusBanner
        session={session}
        onAction={onAction}
        onViewGuide={onViewGuide}
        onReset={onReset}
      />
    );
  }

  it('renders step indicators', () => {
    renderBanner();

    expect(screen.getByText('Prepare')).toBeInTheDocument();
    expect(screen.getByText('Filter Flight')).toBeInTheDocument();
    expect(screen.getByText('Filter Tune')).toBeInTheDocument();
    expect(screen.getByText('PID Flight')).toBeInTheDocument();
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
});
