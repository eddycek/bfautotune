import React from 'react';
import type { CompletedTuningRecord } from '@shared/types/tuning-history.types';
import { NoiseComparisonChart } from './NoiseComparisonChart';
import { AppliedChangesTable } from './AppliedChangesTable';

interface TuningSessionDetailProps {
  record: CompletedTuningRecord;
}

export function TuningSessionDetail({ record }: TuningSessionDetailProps) {
  const hasComparison = !!record.filterMetrics?.spectrum && !!record.verificationMetrics?.spectrum;

  return (
    <div className="session-detail">
      {hasComparison && record.filterMetrics && record.verificationMetrics && (
        <NoiseComparisonChart before={record.filterMetrics} after={record.verificationMetrics} />
      )}

      {!hasComparison && record.filterMetrics && (
        <div className="completion-noise-numeric">
          <div className="completion-noise-stats">
            <span>Noise: {record.filterMetrics.noiseLevel}</span>
            <span className="completion-meta-sep">{'\u2022'}</span>
            <span>Roll {record.filterMetrics.roll.noiseFloorDb.toFixed(0)} dB</span>
            <span className="completion-meta-sep">{'\u2022'}</span>
            <span>Pitch {record.filterMetrics.pitch.noiseFloorDb.toFixed(0)} dB</span>
            <span className="completion-meta-sep">{'\u2022'}</span>
            <span>Yaw {record.filterMetrics.yaw.noiseFloorDb.toFixed(0)} dB</span>
          </div>
        </div>
      )}

      <div className="completion-changes-row">
        <AppliedChangesTable title="Filter Changes" changes={record.appliedFilterChanges} />
        <AppliedChangesTable title="PID Changes" changes={record.appliedPIDChanges} />
        {record.appliedFeedforwardChanges.length > 0 && (
          <AppliedChangesTable
            title="Feedforward Changes"
            changes={record.appliedFeedforwardChanges}
          />
        )}
      </div>

      {record.pidMetrics && (
        <div className="completion-pid-metrics">
          <div className="completion-pid-stats">
            <span>{record.pidMetrics.stepsDetected} steps detected</span>
          </div>
          <div className="completion-pid-axes">
            {(['roll', 'pitch', 'yaw'] as const).map((axis) => {
              const m = record.pidMetrics![axis];
              return (
                <div key={axis} className="completion-pid-axis">
                  <strong>{axis[0].toUpperCase() + axis.slice(1)}</strong>
                  <span>Overshoot: {m.meanOvershoot.toFixed(1)}%</span>
                  <span>Rise: {m.meanRiseTimeMs.toFixed(0)}ms</span>
                  <span>Settling: {m.meanSettlingTimeMs.toFixed(0)}ms</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
