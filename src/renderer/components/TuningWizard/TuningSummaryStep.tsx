import React from 'react';
import { RecommendationCard } from './RecommendationCard';
import type { FilterAnalysisResult, PIDAnalysisResult } from '@shared/types/analysis.types';

interface TuningSummaryStepProps {
  filterResult: FilterAnalysisResult | null;
  pidResult: PIDAnalysisResult | null;
  onExit: () => void;
}

export function TuningSummaryStep({
  filterResult,
  pidResult,
  onExit,
}: TuningSummaryStepProps) {
  const filterRecs = filterResult?.recommendations ?? [];
  const pidRecs = pidResult?.recommendations ?? [];
  const totalRecs = filterRecs.length + pidRecs.length;

  return (
    <div className="analysis-section">
      <h3>Tuning Summary</h3>
      <p>
        {totalRecs === 0
          ? 'No changes recommended — your tune looks good!'
          : `${totalRecs} recommendation${totalRecs > 1 ? 's' : ''} from your flight analysis.`}
      </p>

      {filterRecs.length > 0 && (
        <div className="summary-section">
          <h4>Filter Recommendations</h4>
          <p className="summary-section-subtitle">{filterResult?.summary}</p>
          <div className="recommendation-list">
            {filterRecs.map((rec) => (
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
        </div>
      )}

      {filterRecs.length > 0 && pidRecs.length > 0 && <hr className="summary-divider" />}

      {pidRecs.length > 0 && (
        <div className="summary-section">
          <h4>PID Recommendations</h4>
          <p className="summary-section-subtitle">{pidResult?.summary}</p>
          <div className="recommendation-list">
            {pidRecs.map((rec) => (
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
        </div>
      )}

      <div className="analysis-actions">
        <button
          className="wizard-btn wizard-btn-primary"
          disabled
          title="Applying changes to FC will be available in a future update"
        >
          Apply Changes (Coming Soon)
        </button>
        <button className="wizard-btn wizard-btn-secondary" onClick={onExit}>
          Exit Wizard
        </button>
      </div>
    </div>
  );
}
