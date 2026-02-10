import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestFlightGuideStep } from './TestFlightGuideStep';

describe('TestFlightGuideStep', () => {
  it('renders with full mode intro text by default', () => {
    render(<TestFlightGuideStep onContinue={() => {}} />);

    expect(screen.getByText('Test Flight Guide')).toBeInTheDocument();
    expect(screen.getByText(/Your Blackbox log has been downloaded/)).toBeInTheDocument();
  });

  it('renders filter mode intro text', () => {
    render(<TestFlightGuideStep onContinue={() => {}} mode="filter" />);

    expect(screen.getByText(/Follow this flight plan to collect noise data/)).toBeInTheDocument();
  });

  it('renders pid mode intro text', () => {
    render(<TestFlightGuideStep onContinue={() => {}} mode="pid" />);

    expect(screen.getByText(/Follow this flight plan to collect step response data/)).toBeInTheDocument();
  });

  it('calls onContinue when button clicked', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    render(<TestFlightGuideStep onContinue={onContinue} mode="filter" />);

    await user.click(screen.getByRole('button', { name: /Got it/ }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('passes mode to FlightGuideContent', () => {
    render(<TestFlightGuideStep onContinue={() => {}} mode="filter" />);

    // Filter mode shows Throttle Sweep from FlightGuideContent
    expect(screen.getByText('Throttle Sweep')).toBeInTheDocument();
  });
});
