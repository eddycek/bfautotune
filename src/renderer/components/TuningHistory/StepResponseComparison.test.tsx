import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepResponseComparison } from './StepResponseComparison';
import type { PIDMetricsSummary } from '@shared/types/tuning-history.types';

const before: PIDMetricsSummary = {
  roll: { meanOvershoot: 15, meanRiseTimeMs: 25, meanSettlingTimeMs: 80, meanLatencyMs: 10 },
  pitch: { meanOvershoot: 18, meanRiseTimeMs: 28, meanSettlingTimeMs: 85, meanLatencyMs: 11 },
  yaw: { meanOvershoot: 10, meanRiseTimeMs: 35, meanSettlingTimeMs: 90, meanLatencyMs: 12 },
  stepsDetected: 12,
  currentPIDs: {
    roll: { P: 45, I: 80, D: 30 },
    pitch: { P: 47, I: 84, D: 32 },
    yaw: { P: 45, I: 80, D: 0 },
  },
  summary: 'Before tuning',
};

const after: PIDMetricsSummary = {
  roll: { meanOvershoot: 8, meanRiseTimeMs: 20, meanSettlingTimeMs: 50, meanLatencyMs: 8 },
  pitch: { meanOvershoot: 10, meanRiseTimeMs: 22, meanSettlingTimeMs: 55, meanLatencyMs: 9 },
  yaw: { meanOvershoot: 5, meanRiseTimeMs: 28, meanSettlingTimeMs: 60, meanLatencyMs: 10 },
  stepsDetected: 10,
  currentPIDs: {
    roll: { P: 50, I: 80, D: 35 },
    pitch: { P: 52, I: 84, D: 37 },
    yaw: { P: 50, I: 80, D: 0 },
  },
  summary: 'After tuning',
};

describe('StepResponseComparison', () => {
  it('renders title', () => {
    render(<StepResponseComparison before={before} after={after} />);
    expect(screen.getByText('Step Response Comparison')).toBeInTheDocument();
  });

  it('shows overshoot delta pill with improvement', () => {
    render(<StepResponseComparison before={before} after={after} />);

    // Average overshoot: before (15+18+10)/3 = 14.3, after (8+10+5)/3 = 7.7, delta = -6.7
    const pill = screen.getByText(/-6\.7%/);
    expect(pill).toBeInTheDocument();
    expect(pill.className).toContain('improved');
  });

  it('renders all three axes', () => {
    render(<StepResponseComparison before={before} after={after} />);

    expect(screen.getByText('roll')).toBeInTheDocument();
    expect(screen.getByText('pitch')).toBeInTheDocument();
    expect(screen.getByText('yaw')).toBeInTheDocument();
  });

  it('shows per-axis overshoot before → after values', () => {
    render(<StepResponseComparison before={before} after={after} />);

    expect(screen.getByText('15.0% → 8.0%')).toBeInTheDocument();
    expect(screen.getByText('18.0% → 10.0%')).toBeInTheDocument();
    expect(screen.getByText('10.0% → 5.0%')).toBeInTheDocument();
  });

  it('shows rise time and settling time comparisons', () => {
    render(<StepResponseComparison before={before} after={after} />);

    // Rise time roll: 25ms → 20ms
    expect(screen.getByText('25ms → 20ms')).toBeInTheDocument();
    // Settling time roll: 80ms → 50ms
    expect(screen.getByText('80ms → 50ms')).toBeInTheDocument();
  });

  it('shows regressed state when metrics get worse', () => {
    const worse: PIDMetricsSummary = {
      ...after,
      roll: { meanOvershoot: 25, meanRiseTimeMs: 35, meanSettlingTimeMs: 120, meanLatencyMs: 15 },
      pitch: { meanOvershoot: 28, meanRiseTimeMs: 38, meanSettlingTimeMs: 125, meanLatencyMs: 16 },
      yaw: { meanOvershoot: 20, meanRiseTimeMs: 45, meanSettlingTimeMs: 130, meanLatencyMs: 17 },
    };
    render(<StepResponseComparison before={before} after={worse} />);

    const pills = screen.getAllByText(/\+10\.0%/);
    // The first match is the summary pill
    const pill = pills[0];
    expect(pill.className).toContain('regressed');
  });
});
