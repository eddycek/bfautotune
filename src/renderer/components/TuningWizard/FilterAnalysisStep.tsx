import React from 'react';
import { RecommendationCard } from './RecommendationCard';
import type { FilterAnalysisResult, AnalysisProgress } from '@shared/types/analysis.types';

interface FilterAnalysisStepProps {
  filterResult: FilterAnalysisResult | null;
  filterAnalyzing: boolean;
  filterProgress: AnalysisProgress | null;
  filterError: string | null;
  runFilterAnalysis: () => Promise<void>;
  onContinue: () => void;
}

const STEP_LABELS: Record<string, string> = {
  segmenting: 'Finding steady flight segments...',
  fft: 'Computing frequency spectrum...',
  analyzing: 'Analyzing noise patterns...',
  recommending: 'Generating recommendations...',
};

export function FilterAnalysisStep({
  filterResult,
  filterAnalyzing,
  filterProgress,
  filterError,
  runFilterAnalysis,
  onContinue,
}: FilterAnalysisStepProps) {
  if (filterAnalyzing) {
    return (
      <div className="analysis-section">
        <h3>Filter Analysis</h3>
        <p>Analyzing gyro noise to optimize filter settings...</p>
        {filterProgress && (
          <div className="analysis-progress">
            <div className="analysis-progress-label">
              <span>{STEP_LABELS[filterProgress.step] || filterProgress.step}</span>
              <span>{filterProgress.percent}%</span>
            </div>
            <div className="analysis-progress-bar">
              <div
                className="analysis-progress-fill"
                style={{ width: `${filterProgress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (filterError) {
    return (
      <div className="analysis-section">
        <h3>Filter Analysis</h3>
        <div className="analysis-error">{filterError}</div>
        <div className="analysis-actions">
          <button className="wizard-btn wizard-btn-primary" onClick={runFilterAnalysis}>
            Retry
          </button>
          <button className="wizard-btn wizard-btn-secondary" onClick={onContinue}>
            Skip to PIDs
          </button>
        </div>
      </div>
    );
  }

  if (filterResult) {
    return (
      <div className="analysis-section">
        <h3>Filter Analysis Results</h3>
        <p>
          Noise level:{' '}
          <span className={`noise-level-badge ${filterResult.noise.overallLevel}`}>
            {filterResult.noise.overallLevel}
          </span>
          {' '}&mdash; {filterResult.summary}
        </p>

        {filterResult.recommendations.length > 0 ? (
          <div className="recommendation-list">
            {filterResult.recommendations.map((rec) => (
              <RecommendationCard
                key={rec.setting}
                setting={rec.setting}
                currentValue={rec.currentValue}
                recommendedValue={rec.recommendedValue}
                reason={rec.reason}
                impact={rec.impact}
                confidence={rec.confidence}
              />
            ))}
          </div>
        ) : (
          <div className="analysis-empty">
            <span className="analysis-empty-icon">&#9989;</span>
            <span>Your filter settings look good! No changes recommended.</span>
          </div>
        )}

        <div className="analysis-actions">
          <button className="wizard-btn wizard-btn-primary" onClick={onContinue}>
            Continue to PID Analysis
          </button>
        </div>
      </div>
    );
  }

  // Initial state — not yet run
  return (
    <div className="analysis-section">
      <h3>Filter Analysis</h3>
      <p>
        Analyze gyro noise from your flight data to find optimal filter settings.
        This uses FFT (Fast Fourier Transform) to identify noise frequencies and
        recommend filter adjustments.
      </p>
      <button className="wizard-btn wizard-btn-primary" onClick={runFilterAnalysis}>
        Run Filter Analysis
      </button>
    </div>
  );
}
