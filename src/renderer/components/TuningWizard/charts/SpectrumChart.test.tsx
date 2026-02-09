import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpectrumChart } from './SpectrumChart';
import type { NoiseProfile } from '@shared/types/analysis.types';

function makeSpectrum(count: number) {
  const frequencies = new Float64Array(count);
  const magnitudes = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    frequencies[i] = 20 + (i * 980) / Math.max(count - 1, 1);
    magnitudes[i] = -40 + Math.random() * 20;
  }
  return { frequencies, magnitudes };
}

const mockNoise: NoiseProfile = {
  roll: {
    spectrum: makeSpectrum(50),
    noiseFloorDb: -35,
    peaks: [{ frequency: 150, amplitude: 15, type: 'frame_resonance' }],
  },
  pitch: {
    spectrum: makeSpectrum(50),
    noiseFloorDb: -38,
    peaks: [{ frequency: 350, amplitude: 10, type: 'motor_harmonic' }],
  },
  yaw: {
    spectrum: makeSpectrum(50),
    noiseFloorDb: -42,
    peaks: [],
  },
  overallLevel: 'low',
};

const emptyNoise: NoiseProfile = {
  roll: { spectrum: { frequencies: new Float64Array([]), magnitudes: new Float64Array([]) }, noiseFloorDb: -40, peaks: [] },
  pitch: { spectrum: { frequencies: new Float64Array([]), magnitudes: new Float64Array([]) }, noiseFloorDb: -40, peaks: [] },
  yaw: { spectrum: { frequencies: new Float64Array([]), magnitudes: new Float64Array([]) }, noiseFloorDb: -40, peaks: [] },
  overallLevel: 'low',
};

describe('SpectrumChart', () => {
  it('renders SVG chart with axis tabs', () => {
    const { container } = render(<SpectrumChart noise={mockNoise} />);

    // Axis tabs
    expect(screen.getByRole('tab', { name: 'Roll' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pitch' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Yaw' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();

    // SVG chart
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('shows empty state for empty spectrum data', () => {
    render(<SpectrumChart noise={emptyNoise} />);
    expect(screen.getByText('No spectrum data available.')).toBeInTheDocument();
  });

  it('renders chart lines in SVG', () => {
    const { container } = render(<SpectrumChart noise={mockNoise} />);

    // Recharts renders Line components as paths with class recharts-line
    const lines = container.querySelectorAll('.recharts-line');
    // Default "all" mode shows 3 lines
    expect(lines.length).toBe(3);
  });

  it('switches to single axis when tab clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<SpectrumChart noise={mockNoise} />);

    await user.click(screen.getByRole('tab', { name: 'Roll' }));

    // Only 1 line visible
    const lines = container.querySelectorAll('.recharts-line');
    expect(lines.length).toBe(1);
  });

  it('renders peak markers as reference lines', () => {
    const { container } = render(<SpectrumChart noise={mockNoise} />);

    // Recharts renders ReferenceLine with class recharts-reference-line
    const refLines = container.querySelectorAll('.recharts-reference-line');
    // 3 noise floors (all mode) + 2 peaks = 5
    expect(refLines.length).toBeGreaterThanOrEqual(2);
  });

  it('accepts custom width and height', () => {
    const { container } = render(<SpectrumChart noise={mockNoise} width={500} height={200} />);

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('width')).toBe('500');
    expect(svg!.getAttribute('height')).toBe('200');
  });
});
