import React, { useState, useMemo } from 'react';
import type { CompactThrottleSpectrogram } from '@shared/types/tuning-history.types';
import { ThrottleSpectrogramChart } from '../TuningWizard/charts/ThrottleSpectrogramChart';
import { AxisTabs } from '../TuningWizard/charts/AxisTabs';
import './SpectrogramComparisonChart.css';

interface SpectrogramComparisonChartProps {
  before: CompactThrottleSpectrogram;
  after: CompactThrottleSpectrogram;
}

type Axis = 'roll' | 'pitch' | 'yaw';

function computeAvgDelta(
  before: CompactThrottleSpectrogram,
  after: CompactThrottleSpectrogram,
  axis: Axis
): number | null {
  // Compute average dB difference across all shared frequency/throttle cells
  let sum = 0;
  let count = 0;
  const minBands = Math.min(before.bands.length, after.bands.length);
  for (let b = 0; b < minBands; b++) {
    const beforeBand = before.bands[b][axis];
    const afterBand = after.bands[b][axis];
    const minLen = Math.min(beforeBand.length, afterBand.length);
    for (let f = 0; f < minLen; f++) {
      sum += afterBand[f] - beforeBand[f];
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

export function SpectrogramComparisonChart({ before, after }: SpectrogramComparisonChartProps) {
  const [selectedAxis, setSelectedAxis] = useState<Axis>('roll');

  const delta = useMemo(
    () => computeAvgDelta(before, after, selectedAxis),
    [before, after, selectedAxis]
  );

  const deltaClass =
    delta === null ? 'neutral' : delta < -1 ? 'improved' : delta > 1 ? 'regressed' : 'neutral';

  return (
    <div className="spectrogram-comparison">
      <h4>Throttle Spectrogram Comparison</h4>
      <AxisTabs
        selected={selectedAxis}
        onChange={(a) => setSelectedAxis(a as Axis)}
        showAll={false}
      />
      <div className="spectrogram-comparison-grid">
        <div className="spectrogram-comparison-panel">
          <span className="spectrogram-comparison-label">Before (Analysis Flight)</span>
          <ThrottleSpectrogramChart compactData={before} sharedAxis={selectedAxis} />
        </div>
        <div className="spectrogram-comparison-panel">
          <span className="spectrogram-comparison-label">After (Verification Flight)</span>
          <ThrottleSpectrogramChart compactData={after} sharedAxis={selectedAxis} />
        </div>
      </div>
      {delta !== null && (
        <div className="spectrogram-delta-row">
          <span className="spectrogram-delta-label">Avg noise change</span>
          <span className={`spectrogram-delta-pill ${deltaClass}`}>
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)} dB
          </span>
        </div>
      )}
    </div>
  );
}
