import React from 'react';
import type { WizardStep } from '../../hooks/useTuningWizard';

interface WizardProgressProps {
  currentStep: WizardStep;
}

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'guide', label: 'Flight Guide' },
  { key: 'session', label: 'Session' },
  { key: 'filter', label: 'Filters' },
  { key: 'pid', label: 'PIDs' },
  { key: 'summary', label: 'Summary' },
];

const stepOrder: Record<WizardStep, number> = {
  guide: 0,
  session: 1,
  filter: 2,
  pid: 3,
  summary: 4,
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
