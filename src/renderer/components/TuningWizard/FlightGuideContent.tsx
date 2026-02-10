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
}

export function FlightGuideContent({ mode = 'full' }: FlightGuideContentProps) {
  const phases = mode === 'filter' ? FILTER_FLIGHT_PHASES
    : mode === 'pid' ? PID_FLIGHT_PHASES
    : FLIGHT_PHASES;

  const tips = mode === 'filter' ? FILTER_FLIGHT_TIPS
    : mode === 'pid' ? PID_FLIGHT_TIPS
    : FLIGHT_TIPS;

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
