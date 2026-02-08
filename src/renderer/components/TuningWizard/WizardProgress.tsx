import React from 'react';
import type { WizardStep } from '../../hooks/useTuningWizard';

interface WizardProgressProps {
  currentStep: WizardStep;
}

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'session', label: 'Session' },
  { key: 'filter', label: 'Filters' },
  { key: 'pid', label: 'PIDs' },
  { key: 'summary', label: 'Summary' },
];

const stepOrder: Record<WizardStep, number> = {
  session: 0,
  filter: 1,
  pid: 2,
  summary: 3,
};

export function WizardProgress({ currentStep }: WizardProgressProps) {
  const currentIndex = stepOrder[currentStep];

  return (
    <div className="wizard-progress">
      {STEPS.map((s, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        const className = isDone ? 'done' : isCurrent ? 'current' : 'upcoming';

        return (
          <React.Fragment key={s.key}>
            {i > 0 && <div className={`wizard-progress-line ${isDone ? 'done' : ''}`} />}
            <div className={`wizard-progress-step ${className}`}>
              <div className="wizard-progress-indicator">
                {isDone ? '\u2713' : i + 1}
              </div>
              <span className="wizard-progress-label">{s.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
