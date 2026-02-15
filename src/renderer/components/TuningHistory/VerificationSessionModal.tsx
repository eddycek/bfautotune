import React, { useEffect, useState } from 'react';
import type { BlackboxLogSession } from '@shared/types/blackbox.types';

interface VerificationSessionModalProps {
  logId: string;
  onAnalyze: (sessionIndex: number) => void;
  onCancel: () => void;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function VerificationSessionModal({
  logId,
  onAnalyze,
  onCancel,
}: VerificationSessionModalProps) {
  const [sessions, setSessions] = useState<BlackboxLogSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function parse() {
      try {
        setParsing(true);
        setError(null);
        const result = await window.betaflight.parseBlackboxLog(logId);
        if (cancelled) return;

        if (!result.success || result.sessions.length === 0) {
          setError(result.error || 'No sessions found in log');
          return;
        }

        if (result.sessions.length === 1) {
          // Single session — auto-analyze, no modal needed
          onAnalyze(0);
          return;
        }

        setSessions(result.sessions);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to parse log');
        }
      } finally {
        if (!cancelled) {
          setParsing(false);
        }
      }
    }

    parse();
    return () => {
      cancelled = true;
    };
  }, [logId, onAnalyze]);

  // While parsing single-session logs, show nothing (auto-analyze will fire)
  if (parsing) {
    return (
      <div className="profile-wizard-overlay" role="dialog" aria-label="Parsing log">
        <div className="profile-wizard-modal" style={{ maxWidth: 420 }}>
          <h3>Parsing log...</h3>
          <p>Reading flight sessions from the log file.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="profile-wizard-overlay" role="dialog" aria-label="Parse error">
        <div className="profile-wizard-modal" style={{ maxWidth: 420 }}>
          <h3>Parse Error</h3>
          <p>{error}</p>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <button className="wizard-btn wizard-btn-secondary" onClick={onCancel}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!sessions) return null;

  return (
    <div className="profile-wizard-overlay" role="dialog" aria-label="Select session">
      <div className="profile-wizard-modal" style={{ maxWidth: 480 }}>
        <h3>Select Flight Session</h3>
        <p>This log contains {sessions.length} sessions. Select one for verification analysis.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0' }}>
          {[...sessions].reverse().map((session) => (
            <button
              key={session.index}
              className="wizard-btn wizard-btn-secondary"
              style={{ textAlign: 'left', padding: '10px 14px' }}
              onClick={() => onAnalyze(session.index)}
            >
              <strong>Session {session.index + 1}</strong>
              {' \u2014 '}
              {formatDuration(session.flightData.durationSeconds)}
              {', '}
              {session.flightData.frameCount.toLocaleString()} frames
              {', '}
              {session.flightData.sampleRateHz} Hz
            </button>
          ))}
        </div>
        <div style={{ textAlign: 'right' }}>
          <button className="wizard-btn wizard-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
