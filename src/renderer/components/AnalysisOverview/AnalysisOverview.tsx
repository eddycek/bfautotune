import React, { useState } from 'react';
import { useAnalysisOverview } from '../../hooks/useAnalysisOverview';
import { SpectrumChart } from '../TuningWizard/charts/SpectrumChart';
import { StepResponseChart } from '../TuningWizard/charts/StepResponseChart';
import type { FlightStyle } from '@shared/types/profile.types';
import './AnalysisOverview.css';

const FLIGHT_STYLE_LABELS: Record<FlightStyle, string> = {
  smooth: 'Smooth',
  balanced: 'Balanced',
  aggressive: 'Aggressive',
};

interface AnalysisOverviewProps {
  logId: string;
  onExit: () => void;
}

const FILTER_STEP_LABELS: Record<string, string> = {
  segmenting: 'Finding steady flight segments...',
  fft: 'Computing frequency spectrum...',
  analyzing: 'Analyzing noise patterns...',
  recommending: 'Generating recommendations...',
};

const PID_STEP_LABELS: Record<string, string> = {
  detecting: 'Detecting step inputs...',
  measuring: 'Measuring step responses...',
  scoring: 'Scoring PID performance...',
  recommending: 'Generating recommendations...',
};

const PEAK_TYPE_LABELS: Record<string, string> = {
  frame_resonance: 'Frame',
  motor_harmonic: 'Motor',
  electrical: 'Electrical',
  unknown: 'Unknown',
};

export function AnalysisOverview({ logId, onExit }: AnalysisOverviewProps) {
  const overview = useAnalysisOverview(logId);
  const [noiseDetailsOpen, setNoiseDetailsOpen] = useState(true);
  const [stepChartOpen, setStepChartOpen] = useState(true);

  // Check if any trace data exists for step response chart
  const hasTraces = overview.pidResult
    ? ['roll', 'pitch', 'yaw'].some((axis) =>
        overview.pidResult![axis as 'roll' | 'pitch' | 'yaw'].responses.some(r => r.trace)
      )
    : false;

  return (
    <div className="analysis-overview">
      <div className="analysis-overview-header">
        <div className="analysis-overview-header-left">
          <h2>Analysis Overview</h2>
          <span className="analysis-overview-log-id">Log: {logId}</span>
        </div>
        <button className="wizard-btn wizard-btn-secondary" onClick={onExit}>
          Exit
        </button>
      </div>

      {/* Parsing phase */}
      {overview.parsing && (
        <div className="analysis-overview-section">
          <h3 className="analysis-overview-section-title">Parsing Blackbox Log</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)', margin: '0 0 16px 0' }}>
            Reading flight data from the log file...
          </p>
          {overview.parseProgress && (
            <div className="analysis-progress">
              <div className="analysis-progress-label">
                <span>Session {overview.parseProgress.currentSession + 1}</span>
                <span>{overview.parseProgress.percent}%</span>
              </div>
              <div className="analysis-progress-bar">
                <div
                  className="analysis-progress-fill"
                  style={{ width: `${overview.parseProgress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Parse error */}
      {overview.parseError && (
        <div className="analysis-overview-section">
          <h3 className="analysis-overview-section-title">Parse Error</h3>
          <div className="analysis-error">{overview.parseError}</div>
          <button className="wizard-btn wizard-btn-primary" onClick={overview.retryParse}>
            Retry
          </button>
        </div>
      )}

      {/* Session picker — only for multi-session logs */}
      {overview.sessions && overview.sessions.length > 1 && !overview.filterAnalyzing && !overview.pidAnalyzing && !overview.filterResult && !overview.pidResult && (
        <div className="analysis-overview-section">
          <h3 className="analysis-overview-section-title">Select Flight Session</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)', margin: '0 0 16px 0' }}>
            This log contains {overview.sessions.length} flight sessions. Select one to analyze.
          </p>
          <div className="session-list">
            {[...overview.sessions].reverse().map((session) => (
              <div
                key={session.index}
                className="session-item"
                role="button"
                tabIndex={0}
                onClick={() => overview.setSessionIndex(session.index)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    overview.setSessionIndex(session.index);
                  }
                }}
              >
                <div className="session-item-info">
                  <span className="session-item-title">Session {session.index + 1}</span>
                  <span className="session-item-meta">
                    <span>{session.flightData.durationSeconds.toFixed(1)}s</span>
                    <span>{session.flightData.frameCount.toLocaleString()} frames</span>
                    <span>{session.flightData.sampleRateHz} Hz</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Analysis Section */}
      {overview.filterAnalyzing && (
        <div className="analysis-overview-section">
          <h3 className="analysis-overview-section-title">Filter Analysis</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)', margin: '0 0 16px 0' }}>
            Analyzing gyro noise to evaluate filter settings...
          </p>
          {overview.filterProgress && (
            <div className="analysis-progress">
              <div className="analysis-progress-label">
                <span>{FILTER_STEP_LABELS[overview.filterProgress.step] || overview.filterProgress.step}</span>
                <span>{overview.filterProgress.percent}%</span>
              </div>
              <div className="analysis-progress-bar">
                <div
                  className="analysis-progress-fill"
                  style={{ width: `${overview.filterProgress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {overview.filterError && !overview.filterAnalyzing && (
        <div className="analysis-overview-section">
          <h3 className="analysis-overview-section-title">Filter Analysis</h3>
          <div className="analysis-error">{overview.filterError}</div>
          <button className="wizard-btn wizard-btn-primary" onClick={overview.retryFilterAnalysis}>
            Retry
          </button>
        </div>
      )}

      {overview.filterResult && (
        <div className="analysis-overview-section">
          <h3 className="analysis-overview-section-title">Filter Analysis</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)', margin: '0 0 16px 0' }}>
            Noise level:{' '}
            <span className={`noise-level-badge ${overview.filterResult.noise.overallLevel}`}>
              {overview.filterResult.noise.overallLevel}
            </span>
            {' '}&mdash; {overview.filterResult.summary}
          </p>

          <div className="analysis-meta">
            <span className="analysis-meta-pill">
              {overview.filterResult.segmentsUsed} segment{overview.filterResult.segmentsUsed !== 1 ? 's' : ''} analyzed
            </span>
            {overview.filterResult.rpmFilterActive !== undefined && (
              <span className={`analysis-meta-pill ${overview.filterResult.rpmFilterActive ? 'rpm-active' : 'rpm-inactive'}`}>
                RPM Filter: {overview.filterResult.rpmFilterActive ? 'Active' : 'Not detected'}
              </span>
            )}
          </div>

          {overview.filterResult.rpmFilterActive && (
            <div className="analysis-warning analysis-warning--info">
              <span className="analysis-warning-icon">{'\u2139\uFE0F'}</span>
              <span>RPM filter is active — filter recommendations are optimized for lower latency.</span>
            </div>
          )}

          {overview.filterResult.warnings && overview.filterResult.warnings.length > 0 && (
            <div className="analysis-warnings">
              {overview.filterResult.warnings.map((w, i) => (
                <div key={i} className={`analysis-warning analysis-warning--${w.severity}`}>
                  <span className="analysis-warning-icon">{w.severity === 'error' ? '\u274C' : '\u26A0\uFE0F'}</span>
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
          )}

          <button
            className="noise-details-toggle"
            onClick={() => setNoiseDetailsOpen(!noiseDetailsOpen)}
          >
            {noiseDetailsOpen ? 'Hide noise details' : 'Show noise details'}
          </button>

          {noiseDetailsOpen && (
            <div className="noise-details">
              <p className="chart-description">
                Frequency spectrum of gyro noise during stable hover.
                Peaks indicate noise sources &mdash; <strong>motor harmonics</strong> (propeller vibrations),{' '}
                <strong>frame resonance</strong> (structural vibrations), or <strong>electrical</strong> noise.
                A flat, low spectrum means a clean build. Tall peaks may need filter adjustments.
              </p>
              <p className="chart-legend">
                <span className="chart-legend-item"><span className="chart-legend-line" style={{ borderColor: '#ff6b6b' }} /> Roll</span>
                <span className="chart-legend-item"><span className="chart-legend-line" style={{ borderColor: '#51cf66' }} /> Pitch</span>
                <span className="chart-legend-item"><span className="chart-legend-line" style={{ borderColor: '#4dabf7' }} /> Yaw</span>
                <span className="chart-legend-item"><span className="chart-legend-line chart-legend-line--dashed" /> Noise floor</span>
                <span className="chart-legend-item"><span className="chart-legend-line chart-legend-line--dashed" style={{ borderColor: '#ffd43b' }} /> Peak marker</span>
              </p>
              <SpectrumChart noise={overview.filterResult.noise} />
              <div className="axis-summary">
                {(['roll', 'pitch', 'yaw'] as const).map((axis) => {
                  const profile = overview.filterResult!.noise[axis];
                  return (
                    <div key={axis} className="axis-summary-card">
                      <div className="axis-summary-card-title">{axis}</div>
                      <div className="axis-summary-card-stat">
                        <span>Noise floor: </span>{profile.noiseFloorDb.toFixed(0)} dB
                      </div>
                      <div className="axis-summary-card-stat">
                        <span>Peaks: </span>{profile.peaks.length}
                      </div>
                      {profile.peaks.map((peak, i) => (
                        <div key={i} className="axis-summary-card-stat">
                          <span>{peak.frequency.toFixed(0)} Hz </span>
                          <span className={`noise-peak-badge ${peak.type}`}>
                            {PEAK_TYPE_LABELS[peak.type] || peak.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {/* PID Analysis Section */}
      {overview.pidAnalyzing && (
        <div className="analysis-overview-section">
          <h3 className="analysis-overview-section-title">PID Analysis</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)', margin: '0 0 16px 0' }}>
            Analyzing step responses to evaluate PID gains...
          </p>
          {overview.pidProgress && (
            <div className="analysis-progress">
              <div className="analysis-progress-label">
                <span>{PID_STEP_LABELS[overview.pidProgress.step] || overview.pidProgress.step}</span>
                <span>{overview.pidProgress.percent}%</span>
              </div>
              <div className="analysis-progress-bar">
                <div
                  className="analysis-progress-fill"
                  style={{ width: `${overview.pidProgress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {overview.pidError && !overview.pidAnalyzing && (
        <div className="analysis-overview-section">
          <h3 className="analysis-overview-section-title">PID Analysis</h3>
          <div className="analysis-error">{overview.pidError}</div>
          <button className="wizard-btn wizard-btn-primary" onClick={overview.retryPIDAnalysis}>
            Retry
          </button>
        </div>
      )}

      {overview.pidResult && (
        <div className="analysis-overview-section">
          <h3 className="analysis-overview-section-title">PID Analysis</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)', margin: '0 0 8px 0' }}>
            {overview.pidResult.summary}
          </p>
          <div className="analysis-meta">
            <span className="analysis-meta-pill">
              {overview.pidResult.stepsDetected} step{overview.pidResult.stepsDetected !== 1 ? 's' : ''} detected
            </span>
            {overview.pidResult.flightStyle && (
              <span className="analysis-meta-pill">
                Tuning for: {FLIGHT_STYLE_LABELS[overview.pidResult.flightStyle]} flying
              </span>
            )}
          </div>

          {overview.pidResult.warnings && overview.pidResult.warnings.length > 0 && (
            <div className="analysis-warnings">
              {overview.pidResult.warnings.map((w, i) => (
                <div key={i} className={`analysis-warning analysis-warning--${w.severity}`}>
                  <span className="analysis-warning-icon">
                    {w.severity === 'error' ? '\u274C' : w.severity === 'info' ? '\u2139\uFE0F' : '\u26A0\uFE0F'}
                  </span>
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
          )}

          {overview.pidResult.currentPIDs && (
            <>
              <h4 className="current-pids-heading">Current PID Values</h4>
              <div className="axis-summary">
                {(['roll', 'pitch', 'yaw'] as const).map((axis) => {
                  const pids = overview.pidResult!.currentPIDs[axis];
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
              const profile = overview.pidResult![axis];
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

          {hasTraces && (
            <>
              <button
                className="noise-details-toggle"
                onClick={() => setStepChartOpen(!stepChartOpen)}
              >
                {stepChartOpen ? 'Hide step response charts' : 'Show step response charts'}
              </button>

              {stepChartOpen && (
                <>
                  <p className="chart-description">
                    How the quad responds to stick inputs (step response).
                    The <strong>dashed white line</strong> is the commanded rate (setpoint) and the{' '}
                    <strong>colored line</strong> is the actual gyro response.
                    Ideally, the gyro should follow the setpoint quickly with minimal overshoot and no oscillation.
                  </p>
                  <p className="chart-legend">
                    <span className="chart-legend-item"><span className="chart-legend-line chart-legend-line--dashed" style={{ borderColor: '#fff' }} /> Setpoint</span>
                    <span className="chart-legend-item"><span className="chart-legend-line" style={{ borderColor: '#ff6b6b' }} /> Roll</span>
                    <span className="chart-legend-item"><span className="chart-legend-line" style={{ borderColor: '#51cf66' }} /> Pitch</span>
                    <span className="chart-legend-item"><span className="chart-legend-line" style={{ borderColor: '#4dabf7' }} /> Yaw</span>
                  </p>
                  <StepResponseChart
                    roll={overview.pidResult!.roll}
                    pitch={overview.pidResult!.pitch}
                    yaw={overview.pidResult!.yaw}
                  />
                </>
              )}
            </>
          )}

        </div>
      )}
    </div>
  );
}
