import React from 'react';
import { FLIGHT_PHASES, FLIGHT_TIPS } from '@shared/constants/flightGuide';
import './FlightGuideContent.css';

export function FlightGuideContent() {
  return (
    <>
      <div className="flight-guide-phases">
        {FLIGHT_PHASES.map((phase, i) => (
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
          {FLIGHT_TIPS.map((tip, i) => (
            <li key={i} className="flight-guide-tip">{tip}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
