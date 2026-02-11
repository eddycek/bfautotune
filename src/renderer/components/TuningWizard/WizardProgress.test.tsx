import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WizardProgress } from './WizardProgress';

describe('WizardProgress', () => {
  it('renders all 5 steps in full mode', () => {
    render(<WizardProgress currentStep="session" mode="full" />);

    expect(screen.getByText('Flight Guide')).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('PIDs')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
  });

  it('renders 4 steps in filter mode (no PIDs)', () => {
    render(<WizardProgress currentStep="session" mode="filter" />);

    expect(screen.getByText('Flight Guide')).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.queryByText('PIDs')).not.toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
  });

  it('renders 4 steps in pid mode (no Filters)', () => {
    render(<WizardProgress currentStep="session" mode="pid" />);

    expect(screen.getByText('Flight Guide')).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument();
    expect(screen.queryByText('Filters')).not.toBeInTheDocument();
    expect(screen.getByText('PIDs')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
  });

  it('current step has "current" class', () => {
    const { container } = render(<WizardProgress currentStep="session" mode="full" />);

    const currentStep = container.querySelector('.wizard-progress-step.current');
    expect(currentStep).toBeInTheDocument();
    expect(currentStep?.textContent).toContain('Session');
  });

  it('past steps show checkmark', () => {
    const { container } = render(<WizardProgress currentStep="filter" mode="full" />);

    const doneSteps = container.querySelectorAll('.wizard-progress-step.done');
    expect(doneSteps).toHaveLength(2); // guide and session

    // Check for checkmark character (✓)
    const guideStep = doneSteps[0];
    expect(guideStep.querySelector('.wizard-progress-indicator')?.textContent).toBe('✓');
  });

  it('future steps show numbers', () => {
    const { container } = render(<WizardProgress currentStep="session" mode="full" />);

    const upcomingSteps = container.querySelectorAll('.wizard-progress-step.upcoming');
    expect(upcomingSteps.length).toBeGreaterThan(0);

    // Filter step should be numbered (3)
    const filterStep = Array.from(upcomingSteps).find(step =>
      step.textContent?.includes('Filters')
    );
    expect(filterStep?.querySelector('.wizard-progress-indicator')?.textContent).toBe('3');
  });

  it('shows step labels', () => {
    render(<WizardProgress currentStep="guide" mode="full" />);

    expect(screen.getByText('Flight Guide')).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('PIDs')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
  });

  it('defaults to full mode when mode not provided', () => {
    render(<WizardProgress currentStep="session" />);

    // Should show all 5 steps
    expect(screen.getByText('Flight Guide')).toBeInTheDocument();
    expect(screen.getByText('PIDs')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });
});
