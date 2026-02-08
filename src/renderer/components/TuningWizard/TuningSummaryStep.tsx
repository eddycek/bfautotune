import React from 'react';
import { RecommendationCard, SETTING_LABELS } from './RecommendationCard';
import type { FilterAnalysisResult, PIDAnalysisResult, FilterRecommendation, PIDRecommendation } from '@shared/types/analysis.types';
import type { ApplyRecommendationsProgress, ApplyRecommendationsResult } from '@shared/types/ipc.types';
import type { ApplyState } from '../../hooks/useTuningWizard';

interface TuningSummaryStepProps {
  filterResult: FilterAnalysisResult | null;
  pidResult: PIDAnalysisResult | null;
  onExit: () => void;
  onApply: () => void;
  applyState: ApplyState;
  applyProgress: ApplyRecommendationsProgress | null;
  applyResult: ApplyRecommendationsResult | null;
  applyError: string | null;
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
  onApply,
  applyState,
  applyProgress,
  applyResult,
  applyError,
}: TuningSummaryStepProps) {
  const filterRecs = filterResult?.recommendations ?? [];
  const pidRecs = pidResult?.recommendations ?? [];
  const allRecs: (FilterRecommendation | PIDRecommendation)[] = [...filterRecs, ...pidRecs];
  const totalRecs = allRecs.length;

  const confidenceCounts = { high: 0, medium: 0, low: 0 };
  for (const rec of allRecs) {
    confidenceCounts[rec.confidence]++;
  }

  const isApplyDisabled = totalRecs === 0 || applyState === 'applying' || applyState === 'done';

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

      {applyState === 'applying' && applyProgress && (
        <div className="analysis-progress">
          <div className="analysis-progress-label">
            <span>{applyProgress.message}</span>
            <span>{applyProgress.percent}%</span>
          </div>
          <div className="analysis-progress-bar">
            <div
              className="analysis-progress-fill"
              style={{ width: `${applyProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {applyState === 'done' && applyResult && (
        <div className="apply-success">
          <strong>Changes applied successfully!</strong>
          <br />
          {applyResult.appliedPIDs} PID{applyResult.appliedPIDs !== 1 ? 's' : ''} and{' '}
          {applyResult.appliedFilters} filter{applyResult.appliedFilters !== 1 ? 's' : ''} written to FC.
          {applyResult.snapshotId && <> Pre-tuning snapshot saved.</>}
          <br />
          Your FC is rebooting. Close the wizard and reconnect via the Connection panel.
        </div>
      )}

      {applyState === 'error' && applyError && (
        <div className="analysis-error">
          {applyError}
        </div>
      )}

      <div className="analysis-actions">
        {applyState === 'error' ? (
          <button
            className="wizard-btn wizard-btn-success"
            onClick={onApply}
          >
            Retry Apply
          </button>
        ) : applyState !== 'done' ? (
          <button
            className="wizard-btn wizard-btn-success"
            disabled={isApplyDisabled}
            onClick={onApply}
          >
            {applyState === 'applying' ? 'Applying...' : 'Apply Changes'}
          </button>
        ) : null}
        <button
          className={applyState === 'done' ? 'wizard-btn wizard-btn-primary' : 'wizard-btn wizard-btn-secondary'}
          onClick={onExit}
        >
          {applyState === 'done' ? 'Close Wizard' : 'Exit Wizard'}
        </button>
      </div>
    </div>
  );
}
