import React from 'react';
import { RecommendationCard } from './RecommendationCard';
import type { PIDAnalysisResult, AnalysisProgress } from '@shared/types/analysis.types';

interface PIDAnalysisStepProps {
  pidResult: PIDAnalysisResult | null;
  pidAnalyzing: boolean;
  pidProgress: AnalysisProgress | null;
  pidError: string | null;
  runPIDAnalysis: () => Promise<void>;
  onContinue: () => void;
}

const STEP_LABELS: Record<string, string> = {
  detecting: 'Detecting step inputs...',
  measuring: 'Measuring step responses...',
  scoring: 'Scoring PID performance...',
  recommending: 'Generating recommendations...',
};

export function PIDAnalysisStep({
  pidResult,
  pidAnalyzing,
  pidProgress,
  pidError,
  runPIDAnalysis,
  onContinue,
}: PIDAnalysisStepProps) {
  if (pidAnalyzing) {
    return (
      <div className="analysis-section">
        <h3>PID Analysis</h3>
        <p>Analyzing step responses to optimize PID gains...</p>
        {pidProgress && (
          <div className="analysis-progress">
            <div className="analysis-progress-label">
              <span>{STEP_LABELS[pidProgress.step] || pidProgress.step}</span>
              <span>{pidProgress.percent}%</span>
            </div>
            <div className="analysis-progress-bar">
              <div
                className="analysis-progress-fill"
                style={{ width: `${pidProgress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (pidError) {
    return (
      <div className="analysis-section">
        <h3>PID Analysis</h3>
        <div className="analysis-error">{pidError}</div>
        <div className="analysis-actions">
          <button className="wizard-btn wizard-btn-primary" onClick={runPIDAnalysis}>
            Retry
          </button>
          <button className="wizard-btn wizard-btn-secondary" onClick={onContinue}>
            Skip to Summary
          </button>
        </div>
      </div>
    );
  }

  if (pidResult) {
    return (
      <div className="analysis-section">
        <h3>PID Analysis Results</h3>
        <p>{pidResult.summary}</p>
        <p className="analysis-section-detail">
          {pidResult.stepsDetected} step inputs detected across all axes.
        </p>

        <div className="analysis-meta">
          <span className="analysis-meta-pill">
            {(pidResult.analysisTimeMs / 1000).toFixed(2)}s
          </span>
        </div>

        {pidResult.currentPIDs && (
          <>
            <h4 className="current-pids-heading">Current PID Values</h4>
            <div className="axis-summary">
              {(['roll', 'pitch', 'yaw'] as const).map((axis) => {
                const pids = pidResult.currentPIDs[axis];
                return (
                  <div key={`current-${axis}`} className="axis-summary-card">
                    <div className="axis-summary-card-title">{axis}</div>
                    <div className="axis-summary-card-stat">
                      <span>P: </span>{pids.P}
                    </div>
                    <div className="axis-summary-card-stat">
                      <span>I: </span>{pids.I}
                    </div>
                    <div className="axis-summary-card-stat">
                      <span>D: </span>{pids.D}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <h4 className="current-pids-heading">Step Response Metrics</h4>
        <div className="axis-summary">
          {(['roll', 'pitch', 'yaw'] as const).map((axis) => {
            const profile = pidResult[axis];
            return (
              <div key={axis} className="axis-summary-card">
                <div className="axis-summary-card-title">{axis}</div>
                <div className="axis-summary-card-stat">
                  <span>Overshoot: </span>{profile.meanOvershoot.toFixed(1)}%
                </div>
                <div className="axis-summary-card-stat">
                  <span>Rise: </span>{profile.meanRiseTimeMs.toFixed(0)} ms
                </div>
                <div className="axis-summary-card-stat">
                  <span>Settling: </span>{profile.meanSettlingTimeMs.toFixed(0)} ms
                </div>
                <div className="axis-summary-card-stat">
                  <span>Latency: </span>{profile.meanLatencyMs.toFixed(0)} ms
                </div>
              </div>
            );
          })}
        </div>

        {pidResult.recommendations.length > 0 ? (
          <div className="recommendation-list">
            {pidResult.recommendations.map((rec) => (
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
            <span>Your PID settings look good! No changes recommended.</span>
          </div>
        )}

        <div className="analysis-actions">
          <button className="wizard-btn wizard-btn-primary" onClick={onContinue}>
            Continue to Summary
          </button>
        </div>
      </div>
    );
  }

  // Initial state — not yet run
  return (
    <div className="analysis-section">
      <h3>PID Analysis</h3>
      <p>
        Analyze stick input step responses to evaluate PID performance.
        This measures overshoot, rise time, and settling time to find
        optimal P, I, and D gains.
      </p>
      <p className="analysis-section-detail">
        Tip: For best results, your test flight should include quick, sharp stick
        inputs (snaps) on each axis.
      </p>
      <button className="wizard-btn wizard-btn-primary" onClick={runPIDAnalysis}>
        Run PID Analysis
      </button>
    </div>
  );
}
