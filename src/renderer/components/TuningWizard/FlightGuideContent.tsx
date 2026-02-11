import React from 'react';
import type { TuningMode } from '@shared/types/tuning.types';
import {
  FLIGHT_PHASES,
  FLIGHT_TIPS,
  FILTER_FLIGHT_PHASES,
  FILTER_FLIGHT_TIPS,
  PID_FLIGHT_PHASES,
  PID_FLIGHT_TIPS,
} from '@shared/constants/flightGuide';
import './FlightGuideContent.css';

interface FlightGuideContentProps {
  mode?: TuningMode;
  /** Connected FC version string (e.g. '4.5.1'). When provided, version-specific tips are filtered. */
  fcVersion?: string;
}

/** BF 4.6+ logs unfiltered gyro by default — GYRO_SCALED tip not needed */
function shouldHideGyroScaledTip(version?: string): boolean {
  if (!version) return false;
  const match = version.match(/^(\d+)\.(\d+)/);
  if (!match) return false;
  return parseInt(match[1]) > 4 || (parseInt(match[1]) === 4 && parseInt(match[2]) >= 6);
}

export function FlightGuideContent({ mode = 'full', fcVersion }: FlightGuideContentProps) {
  const phases = mode === 'filter' ? FILTER_FLIGHT_PHASES
    : mode === 'pid' ? PID_FLIGHT_PHASES
    : FLIGHT_PHASES;

  const hideGyroTip = shouldHideGyroScaledTip(fcVersion);
  const allTips = mode === 'filter' ? FILTER_FLIGHT_TIPS
    : mode === 'pid' ? PID_FLIGHT_TIPS
    : FLIGHT_TIPS;
  const tips = hideGyroTip ? allTips.filter(t => !t.includes('GYRO_SCALED')) : allTips;

  return (
    <>
      <div className="flight-guide-phases">
        {phases.map((phase, i) => (
          <div key={i} className="flight-guide-phase">
            <div className="flight-guide-phase-number">{i + 1}</div>
            <div className="flight-guide-phase-content">
              <div className="flight-guide-phase-header">
                <strong>{phase.title}</strong>
                {phase.duration && (
                  <span className="flight-guide-phase-duration">
                    {phase.duration}
                  </span>
                )}
              </div>
              <span className="flight-guide-phase-desc">{phase.description}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flight-guide-tips">
        <strong>Tips</strong>
        <ul>
          {tips.map((tip, i) => (
            <li key={i} className="flight-guide-tip">{tip}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
