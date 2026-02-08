import React from 'react';
import { RecommendationCard, SETTING_LABELS } from './RecommendationCard';
import type { FilterAnalysisResult, PIDAnalysisResult, FilterRecommendation, PIDRecommendation } from '@shared/types/analysis.types';

interface TuningSummaryStepProps {
  filterResult: FilterAnalysisResult | null;
  pidResult: PIDAnalysisResult | null;
  onExit: () => void;
}

function getChangeText(current: number, recommended: number): { text: string; className: string } {
  if (current === recommended) return { text: '0%', className: '' };
  if (current === 0) return { text: `+${recommended}`, className: 'positive' };
  const pct = Math.round(((recommended - current) / Math.abs(current)) * 100);
  if (pct === 0) return { text: '0%', className: '' };
  const sign = pct > 0 ? '+' : '';
  return {
    text: `${sign}${pct}%`,
    className: pct > 0 ? 'positive' : 'negative',
  };
}

export function TuningSummaryStep({
  filterResult,
  pidResult,
  onExit,
}: TuningSummaryStepProps) {
  const filterRecs = filterResult?.recommendations ?? [];
  const pidRecs = pidResult?.recommendations ?? [];
  const allRecs: (FilterRecommendation | PIDRecommendation)[] = [...filterRecs, ...pidRecs];
  const totalRecs = allRecs.length;

  const confidenceCounts = { high: 0, medium: 0, low: 0 };
  for (const rec of allRecs) {
    confidenceCounts[rec.confidence]++;
  }

  return (
    <div className="analysis-section">
      <h3>Tuning Summary</h3>
      {totalRecs === 0 ? (
        <p>No changes recommended — your tune looks good!</p>
      ) : (
        <>
          <div className="summary-stats">
            <span className="analysis-meta-pill">
              {filterRecs.length} filter change{filterRecs.length !== 1 ? 's' : ''}
            </span>
            <span className="analysis-meta-pill">
              {pidRecs.length} PID change{pidRecs.length !== 1 ? 's' : ''}
            </span>
            {confidenceCounts.high > 0 && (
              <span className="analysis-meta-pill confidence-high">
                {confidenceCounts.high} high confidence
              </span>
            )}
            {confidenceCounts.medium > 0 && (
              <span className="analysis-meta-pill confidence-medium">
                {confidenceCounts.medium} medium confidence
              </span>
            )}
            {confidenceCounts.low > 0 && (
              <span className="analysis-meta-pill confidence-low">
                {confidenceCounts.low} low confidence
              </span>
            )}
          </div>

          <table className="changes-table">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Current</th>
                <th>Recommended</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {allRecs.map((rec) => {
                const change = getChangeText(rec.currentValue, rec.recommendedValue);
                const isFilter = filterRecs.includes(rec as FilterRecommendation);
                const unit = isFilter ? ' Hz' : '';
                return (
                  <tr key={rec.setting}>
                    <td>{SETTING_LABELS[rec.setting] || rec.setting}</td>
                    <td>{rec.currentValue}{unit}</td>
                    <td>{rec.recommendedValue}{unit}</td>
                    <td>
                      <span className={`change-badge ${change.className}`}>
                        {change.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

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
                unit="Hz"
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
