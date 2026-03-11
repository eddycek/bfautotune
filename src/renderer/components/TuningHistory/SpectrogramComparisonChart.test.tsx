import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpectrogramComparisonChart } from './SpectrogramComparisonChart';
import type { CompactThrottleSpectrogram } from '@shared/types/tuning-history.types';

const before: CompactThrottleSpectrogram = {
  frequencies: [100, 200, 300],
  bands: [
    {
      throttleMin: 0.3,
      throttleMax: 0.5,
      roll: [-30, -35, -40],
      pitch: [-32, -37, -42],
      yaw: [-34, -39, -44],
    },
    {
      throttleMin: 0.5,
      throttleMax: 0.7,
      roll: [-28, -33, -38],
      pitch: [-30, -35, -40],
      yaw: [-32, -37, -42],
    },
  ],
  bandsWithData: 2,
};

const after: CompactThrottleSpectrogram = {
  frequencies: [100, 200, 300],
  bands: [
    {
      throttleMin: 0.3,
      throttleMax: 0.5,
      roll: [-35, -40, -45],
      pitch: [-37, -42, -47],
      yaw: [-39, -44, -49],
    },
    {
      throttleMin: 0.5,
      throttleMax: 0.7,
      roll: [-33, -38, -43],
      pitch: [-35, -40, -45],
      yaw: [-37, -42, -47],
    },
  ],
  bandsWithData: 2,
};

describe('SpectrogramComparisonChart', () => {
  it('renders title and both panels', () => {
    render(<SpectrogramComparisonChart before={before} after={after} />);

    expect(screen.getByText('Throttle Spectrogram Comparison')).toBeInTheDocument();
    expect(screen.getByText('Before (Analysis Flight)')).toBeInTheDocument();
    expect(screen.getByText('After (Verification Flight)')).toBeInTheDocument();
  });

  it('renders dB delta pill with improvement', () => {
    render(<SpectrogramComparisonChart before={before} after={after} />);

    // After is 5 dB lower (better) than before across all cells
    const pill = screen.getByText(/-5\.0 dB/);
    expect(pill).toBeInTheDocument();
    expect(pill.className).toContain('improved');
  });

  it('renders axis tabs (Roll/Pitch/Yaw)', () => {
    render(<SpectrogramComparisonChart before={before} after={after} />);

    expect(screen.getByText('Roll')).toBeInTheDocument();
    expect(screen.getByText('Pitch')).toBeInTheDocument();
    expect(screen.getByText('Yaw')).toBeInTheDocument();
  });

  it('switches axis on tab click', async () => {
    const user = userEvent.setup();
    render(<SpectrogramComparisonChart before={before} after={after} />);

    await user.click(screen.getByText('Pitch'));
    // Delta should still show improvement (pitch dB values are also 5 dB lower)
    expect(screen.getByText(/-5\.0 dB/)).toBeInTheDocument();
  });

  it('renders two spectrogram charts', () => {
    const { container } = render(<SpectrogramComparisonChart before={before} after={after} />);

    const charts = container.querySelectorAll('.spectrogram-chart');
    expect(charts.length).toBe(2);
  });
});
