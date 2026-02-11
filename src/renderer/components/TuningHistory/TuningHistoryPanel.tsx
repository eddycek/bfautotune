import React, { useState } from 'react';
import type { CompletedTuningRecord } from '@shared/types/tuning-history.types';
import { TuningSessionDetail } from './TuningSessionDetail';
import './TuningHistoryPanel.css';

interface TuningHistoryPanelProps {
  history: CompletedTuningRecord[];
  loading: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function recordSummary(record: CompletedTuningRecord): string {
  const parts: string[] = [];
  const fc = record.appliedFilterChanges.length;
  const pc = record.appliedPIDChanges.length;
  if (fc > 0) parts.push(`${fc} filter`);
  if (pc > 0) parts.push(`${pc} PID`);
  const changes = parts.length > 0 ? `${parts.join(' + ')} changes` : 'No changes';

  const noise = record.filterMetrics
    ? `Noise: ${record.filterMetrics.noiseLevel}`
    : '';

  return noise ? `${changes} \u2022 ${noise}` : changes;
}

export function TuningHistoryPanel({ history, loading }: TuningHistoryPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) return null;
  if (history.length === 0) return null;

  return (
    <div className="tuning-history-panel">
      <h3 className="tuning-history-title">Tuning History</h3>

      <div className="tuning-history-list">
        {history.map((record) => {
          const isExpanded = expandedId === record.id;
          return (
            <div key={record.id} className={`tuning-history-card ${isExpanded ? 'expanded' : ''}`}>
              <button
                className="tuning-history-card-header"
                onClick={() => setExpandedId(isExpanded ? null : record.id)}
                aria-expanded={isExpanded}
              >
                <div className="tuning-history-card-info">
                  <span className="tuning-history-card-date">{formatDate(record.completedAt)}</span>
                  <span className="tuning-history-card-summary">{recordSummary(record)}</span>
                </div>
                <span className={`tuning-history-card-chevron ${isExpanded ? 'open' : ''}`}>
                  {'\u25B8'}
                </span>
              </button>

              {isExpanded && (
                <div className="tuning-history-card-body">
                  <TuningSessionDetail record={record} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
