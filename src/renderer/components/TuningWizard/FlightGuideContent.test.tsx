import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlightGuideContent } from './FlightGuideContent';

describe('FlightGuideContent', () => {
  it('renders full mode phases by default', () => {
    render(<FlightGuideContent />);

    // FLIGHT_PHASES includes Roll Snaps, Pitch Snaps (combined guide)
    expect(screen.getByText('Roll Snaps')).toBeInTheDocument();
    expect(screen.getByText('Pitch Snaps')).toBeInTheDocument();
    expect(screen.getByText('Yaw Snaps')).toBeInTheDocument();
  });

  it('renders filter mode phases', () => {
    render(<FlightGuideContent mode="filter" />);

    // FILTER_FLIGHT_PHASES has Throttle Sweep instead of snaps
    expect(screen.getByText('Throttle Sweep')).toBeInTheDocument();
    expect(screen.queryByText('Roll Snaps')).not.toBeInTheDocument();
  });

  it('renders pid mode phases', () => {
    render(<FlightGuideContent mode="pid" />);

    // PID_FLIGHT_PHASES has snaps but no Throttle Sweep
    expect(screen.getByText('Roll Snaps')).toBeInTheDocument();
    expect(screen.getByText('Pitch Snaps')).toBeInTheDocument();
    expect(screen.queryByText('Throttle Sweep')).not.toBeInTheDocument();
  });

  it('renders filter mode tips', () => {
    render(<FlightGuideContent mode="filter" />);

    expect(screen.getByText(/Throttle sweeps should be slow/)).toBeInTheDocument();
  });

  it('renders pid mode tips', () => {
    render(<FlightGuideContent mode="pid" />);

    expect(screen.getByText(/Mix half-stick and full-stick snaps/)).toBeInTheDocument();
  });

  it('renders full mode tips', () => {
    render(<FlightGuideContent mode="full" />);

    expect(screen.getByText(/One pack = one test flight/)).toBeInTheDocument();
  });
});
