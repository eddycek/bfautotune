import React from 'react';
import { useTuningWizard } from '../../hooks/useTuningWizard';
import { WizardProgress } from './WizardProgress';
import { SessionSelectStep } from './SessionSelectStep';
import { FilterAnalysisStep } from './FilterAnalysisStep';
import { PIDAnalysisStep } from './PIDAnalysisStep';
import { TuningSummaryStep } from './TuningSummaryStep';
import './TuningWizard.css';

interface TuningWizardProps {
  logId: string;
  onExit: () => void;
}

export function TuningWizard({ logId, onExit }: TuningWizardProps) {
  const wizard = useTuningWizard(logId);

  const renderStep = () => {
    switch (wizard.step) {
      case 'session':
        return (
          <SessionSelectStep
            sessions={wizard.sessions}
            parsing={wizard.parsing}
            parseProgress={wizard.parseProgress}
            parseError={wizard.parseError}
            parseLog={wizard.parseLog}
            sessionIndex={wizard.sessionIndex}
            onSelectSession={(idx) => {
              wizard.setSessionIndex(idx);
              wizard.setStep('filter');
            }}
          />
        );
      case 'filter':
        return (
          <FilterAnalysisStep
            filterResult={wizard.filterResult}
            filterAnalyzing={wizard.filterAnalyzing}
            filterProgress={wizard.filterProgress}
            filterError={wizard.filterError}
            runFilterAnalysis={wizard.runFilterAnalysis}
            onContinue={() => wizard.setStep('pid')}
          />
        );
      case 'pid':
        return (
          <PIDAnalysisStep
            pidResult={wizard.pidResult}
            pidAnalyzing={wizard.pidAnalyzing}
            pidProgress={wizard.pidProgress}
            pidError={wizard.pidError}
            runPIDAnalysis={wizard.runPIDAnalysis}
            onContinue={() => wizard.setStep('summary')}
          />
        );
      case 'summary':
        return (
          <TuningSummaryStep
            filterResult={wizard.filterResult}
            pidResult={wizard.pidResult}
            onExit={onExit}
          />
        );
    }
  };

  return (
    <div className="tuning-wizard">
      <div className="tuning-wizard-header">
        <div className="tuning-wizard-header-left">
          <h2>Tuning Wizard</h2>
          <span className="tuning-wizard-log-id">Log: {logId}</span>
        </div>
        <button className="wizard-btn wizard-btn-secondary" onClick={onExit}>
          Exit
        </button>
      </div>

      <WizardProgress currentStep={wizard.step} />

      <div className="tuning-wizard-content">
        {renderStep()}
      </div>
    </div>
  );
}
