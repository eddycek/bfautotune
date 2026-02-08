import React from 'react';
import { FlightGuideContent } from './FlightGuideContent';

interface TestFlightGuideStepProps {
  onContinue: () => void;
}

export function TestFlightGuideStep({ onContinue }: TestFlightGuideStepProps) {
  return (
    <div className="analysis-section">
      <h3>Test Flight Guide</h3>
      <p>
        Your Blackbox log has been downloaded. Here's what the analysis needs
        from your flight data — if you haven't flown yet, follow these steps for
        the best results.
      </p>

      <FlightGuideContent />

      <div className="analysis-actions">
        <button className="wizard-btn wizard-btn-primary" onClick={onContinue}>
          Got it — Start Analysis
        </button>
      </div>
    </div>
  );
}
