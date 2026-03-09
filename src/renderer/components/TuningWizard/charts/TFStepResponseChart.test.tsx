import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TFStepResponseChart } from './TFStepResponseChart';

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

function makeStepResponse() {
  const len = 50;
  const timeMs = Array.from({ length: len }, (_, i) => i * 2);
  return {
    roll: {
      timeMs,
      response: Array.from({ length: len }, (_, i) => {
        if (i < 5) return 0;
        return 1 + 0.15 * Math.exp(-(i - 5) * 0.1) * Math.sin(i * 0.5);
      }),
    },
    pitch: {
      timeMs,
      response: Array.from({ length: len }, (_, i) => {
        if (i < 5) return 0;
        return 1 + 0.1 * Math.exp(-(i - 5) * 0.1) * Math.sin(i * 0.5);
      }),
    },
    yaw: {
      timeMs,
      response: Array.from({ length: len }, (_, i) => {
        if (i < 5) return 0;
        return 1 + 0.2 * Math.exp(-(i - 5) * 0.1) * Math.sin(i * 0.5);
      }),
    },
  };
}

function makeBeforeStepResponse() {
  const len = 50;
  const timeMs = Array.from({ length: len }, (_, i) => i * 2);
  return {
    roll: {
      timeMs,
      response: Array.from({ length: len }, (_, i) => {
        if (i < 5) return 0;
        return 1 + 0.3 * Math.exp(-(i - 5) * 0.08) * Math.sin(i * 0.5);
      }),
    },
    pitch: {
      timeMs,
      response: Array.from({ length: len }, (_, i) => {
        if (i < 5) return 0;
        return 1 + 0.25 * Math.exp(-(i - 5) * 0.08) * Math.sin(i * 0.5);
      }),
    },
    yaw: {
      timeMs,
      response: Array.from({ length: len }, (_, i) => {
        if (i < 5) return 0;
        return 1 + 0.35 * Math.exp(-(i - 5) * 0.08) * Math.sin(i * 0.5);
      }),
    },
  };
}

describe('TFStepResponseChart', () => {
  it('renders single mode with axis lines and tabs', () => {
    const { container } = render(<TFStepResponseChart stepResponse={makeStepResponse()} />);

    expect(screen.getByText('Synthetic Step Response')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Roll' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();

    // Should show overshoot metrics
    expect(screen.getAllByText(/overshoot:/).length).toBeGreaterThan(0);
  });

  it('renders comparison mode with before/after lines', () => {
    const { container } = render(
      <TFStepResponseChart
        stepResponse={makeStepResponse()}
        beforeStepResponse={makeBeforeStepResponse()}
      />
    );

    expect(screen.getByText('Step Response Comparison')).toBeInTheDocument();

    // Should have more lines than single mode (before + after)
    const lines = container.querySelectorAll('.recharts-line');
    expect(lines.length).toBeGreaterThanOrEqual(6); // 3 before + 3 after in 'all' mode
  });

  it('shows delta pill in comparison mode', () => {
    render(
      <TFStepResponseChart
        stepResponse={makeStepResponse()}
        beforeStepResponse={makeBeforeStepResponse()}
      />
    );

    // Delta pill should show overshoot change
    const pill = screen.getByText(/overshoot$/);
    expect(pill).toBeInTheDocument();
    expect(pill.className).toMatch(/tf-overshoot-delta-pill/);
  });

  it('shows empty state for empty data', () => {
    const emptyResponse = {
      roll: { timeMs: [] as number[], response: [] as number[] },
      pitch: { timeMs: [] as number[], response: [] as number[] },
      yaw: { timeMs: [] as number[], response: [] as number[] },
    };

    render(<TFStepResponseChart stepResponse={emptyResponse} />);

    expect(screen.getByText('No synthetic step response data available.')).toBeInTheDocument();
  });

  it('switches axis when tab is clicked', async () => {
    const user = userEvent.setup();
    render(<TFStepResponseChart stepResponse={makeStepResponse()} />);

    // Default is 'all', click 'Roll' to switch to single axis
    await user.click(screen.getByRole('tab', { name: 'Roll' }));

    // Should show only roll overshoot metric
    const metrics = screen.getAllByText(/overshoot:/);
    expect(metrics).toHaveLength(1);
  });

  it('accepts compact format (shared timeMs)', () => {
    const compact = {
      timeMs: Array.from({ length: 20 }, (_, i) => i * 5),
      roll: Array.from({ length: 20 }, (_, i) => (i < 3 ? 0 : 1.1)),
      pitch: Array.from({ length: 20 }, (_, i) => (i < 3 ? 0 : 1.05)),
      yaw: Array.from({ length: 20 }, (_, i) => (i < 3 ? 0 : 1.15)),
    };

    const { container } = render(<TFStepResponseChart stepResponse={compact} />);

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });
});
