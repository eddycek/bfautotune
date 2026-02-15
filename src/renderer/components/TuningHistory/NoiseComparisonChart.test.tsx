import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoiseComparisonChart } from './NoiseComparisonChart';
import type { FilterMetricsSummary, CompactSpectrum } from '@shared/types/tuning-history.types';

// ResponsiveContainer needs a real layout engine — mock it for JSDOM
vi.mock('recharts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('recharts')>();
  const { cloneElement } = await import('react');
  return {
    ...mod,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      cloneElement(children, { width: 700, height: 260 }),
  };
});

const makeSpectrum = (offset = 0): CompactSpectrum => ({
  frequencies: [100, 200, 300, 400, 500],
  roll: [-30 + offset, -35 + offset, -40 + offset, -45 + offset, -50 + offset],
  pitch: [-32 + offset, -37 + offset, -42 + offset, -47 + offset, -52 + offset],
  yaw: [-34 + offset, -39 + offset, -44 + offset, -49 + offset, -54 + offset],
});

const makeMetrics = (noiseFloor: number, spectrum?: CompactSpectrum): FilterMetricsSummary => ({
  noiseLevel: 'medium',
  roll: { noiseFloorDb: noiseFloor, peakCount: 1 },
  pitch: { noiseFloorDb: noiseFloor - 2, peakCount: 0 },
  yaw: { noiseFloorDb: noiseFloor - 4, peakCount: 0 },
  segmentsUsed: 3,
  summary: 'test',
  spectrum,
});

describe('NoiseComparisonChart', () => {
  it('renders chart when spectra available', () => {
    const before = makeMetrics(-40, makeSpectrum(0));
    const after = makeMetrics(-52, makeSpectrum(-12));

    const { container } = render(<NoiseComparisonChart before={before} after={after} />);

    expect(screen.getByText('Noise Comparison')).toBeInTheDocument();
    expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
  });

  it('shows improvement delta pill', () => {
    const before = makeMetrics(-40, makeSpectrum(0));
    const after = makeMetrics(-52, makeSpectrum(-12));

    render(<NoiseComparisonChart before={before} after={after} />);

    const pill = screen.getByText(/improvement/);
    expect(pill).toBeInTheDocument();
    expect(pill.className).toContain('improved');
  });

  it('shows regression delta pill', () => {
    const before = makeMetrics(-50, makeSpectrum(0));
    const after = makeMetrics(-45, makeSpectrum(5));

    render(<NoiseComparisonChart before={before} after={after} />);

    const pill = screen.getByText(/regression/);
    expect(pill).toBeInTheDocument();
    expect(pill.className).toContain('regressed');
  });

  it('shows empty message when no spectra', () => {
    const before = makeMetrics(-40);
    const after = makeMetrics(-52);

    render(<NoiseComparisonChart before={before} after={after} />);

    expect(screen.getByText(/No spectrum data available/)).toBeInTheDocument();
  });

  it('renders axis tabs', () => {
    const before = makeMetrics(-40, makeSpectrum(0));
    const after = makeMetrics(-52, makeSpectrum(-12));

    render(<NoiseComparisonChart before={before} after={after} />);

    expect(screen.getByRole('tab', { name: 'Roll' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pitch' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Yaw' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
  });

  it('switches axis on tab click', async () => {
    const user = userEvent.setup();
    const before = makeMetrics(-40, makeSpectrum(0));
    const after = makeMetrics(-52, makeSpectrum(-12));

    render(<NoiseComparisonChart before={before} after={after} />);

    const pitchTab = screen.getByRole('tab', { name: 'Pitch' });
    await user.click(pitchTab);
    expect(pitchTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders noise floor items for all axes', () => {
    const before = makeMetrics(-40, makeSpectrum(0));
    const after = makeMetrics(-52, makeSpectrum(-12));

    render(<NoiseComparisonChart before={before} after={after} />);

    // Checks for per-axis floor text
    expect(screen.getByText(/roll:/i)).toBeInTheDocument();
    expect(screen.getByText(/pitch:/i)).toBeInTheDocument();
    expect(screen.getByText(/yaw:/i)).toBeInTheDocument();
  });

  it('uses spectrum fallback when noiseFloorDb is sentinel -240', () => {
    const before = makeMetrics(-40, makeSpectrum(0));
    const after = makeMetrics(-240, makeSpectrum(-12));

    render(<NoiseComparisonChart before={before} after={after} />);

    // Fallback computes noise floor from spectrum → delta pill should render
    expect(screen.getByText(/improvement/)).toBeInTheDocument();
    // Should NOT show -240 anywhere
    const floorItems = screen.getAllByText(/→/);
    for (const item of floorItems) {
      expect(item.textContent).not.toContain('-240');
    }
  });

  it('shows dash when both noiseFloorDb and spectrum are invalid', () => {
    // Spectrum with all values below DB_FLOOR (-80) → fallback also fails
    const badSpectrum: CompactSpectrum = {
      frequencies: [100, 200],
      roll: [-90, -95],
      pitch: [-90, -95],
      yaw: [-90, -95],
    };
    const before = makeMetrics(-40, makeSpectrum(0));
    const after = makeMetrics(-240, badSpectrum);

    render(<NoiseComparisonChart before={before} after={after} />);

    // No valid after floor → hide delta pill
    expect(screen.queryByText(/improvement/)).not.toBeInTheDocument();
    expect(screen.queryByText(/regression/)).not.toBeInTheDocument();
    // Per-axis should show dash for after
    const floorItems = screen.getAllByText(/→/);
    for (const item of floorItems) {
      expect(item.textContent).toContain('—');
    }
  });
});
