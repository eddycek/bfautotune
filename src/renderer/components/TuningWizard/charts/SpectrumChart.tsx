import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { AxisTabs, type AxisSelection } from './AxisTabs';
import {
  spectrumToRechartsData,
  downsampleData,
  AXIS_COLORS,
  type Axis,
  type SpectrumDataPoint,
} from './chartUtils';
import type { NoiseProfile, NoisePeak } from '@shared/types/analysis.types';
import './SpectrumChart.css';

interface SpectrumChartProps {
  noise: NoiseProfile;
  width?: number;
  height?: number;
}

const MAX_CHART_POINTS = 500;

const PEAK_COLORS: Record<string, string> = {
  frame_resonance: '#ff8787',
  motor_harmonic: '#ffd43b',
  electrical: '#4dabf7',
  unknown: '#aaa',
};

const PEAK_LABELS: Record<string, string> = {
  frame_resonance: 'Frame',
  motor_harmonic: 'Motor',
  electrical: 'Electrical',
  unknown: 'Unknown',
};

export function SpectrumChart({ noise, width = 700, height = 300 }: SpectrumChartProps) {
  const [selectedAxis, setSelectedAxis] = useState<AxisSelection>('all');

  const data = useMemo(() => {
    const raw = spectrumToRechartsData(
      { roll: noise.roll, pitch: noise.pitch, yaw: noise.yaw },
      20,
      1000
    );
    return downsampleData(raw, MAX_CHART_POINTS);
  }, [noise]);

  const visibleAxes: Axis[] = selectedAxis === 'all'
    ? ['roll', 'pitch', 'yaw']
    : [selectedAxis];

  // Collect peaks for visible axes
  const visiblePeaks: (NoisePeak & { axis: Axis })[] = [];
  for (const axis of visibleAxes) {
    for (const peak of noise[axis].peaks) {
      visiblePeaks.push({ ...peak, axis });
    }
  }

  // Noise floor for visible axes
  const noiseFloors = visibleAxes.map(axis => ({
    axis,
    value: noise[axis].noiseFloorDb,
  }));

  if (data.length === 0) {
    return (
      <div className="spectrum-chart-empty">
        No spectrum data available.
      </div>
    );
  }

  return (
    <div className="spectrum-chart">
      <AxisTabs selected={selectedAxis} onChange={setSelectedAxis} />
      <div className="spectrum-chart-container">
        <LineChart
          width={width}
          height={height}
          data={data}
          margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="frequency"
            type="number"
            domain={[20, 1000]}
            tick={{ fontSize: 11, fill: '#aaa' }}
            label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -2, style: { fontSize: 11, fill: '#888' } }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#aaa' }}
            label={{ value: 'dB', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#888' } }}
          />
          <Tooltip
            contentStyle={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 4, fontSize: 12 }}
            labelFormatter={(val) => `${val} Hz`}
            formatter={(value: number, name: string) => [`${value.toFixed(1)} dB`, name]}
          />

          {visibleAxes.map(axis => (
            <Line
              key={axis}
              dataKey={axis}
              stroke={AXIS_COLORS[axis]}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name={axis}
            />
          ))}

          {/* Noise floor reference lines */}
          {noiseFloors.map(({ axis, value }) => (
            <ReferenceLine
              key={`floor-${axis}`}
              y={value}
              stroke={AXIS_COLORS[axis]}
              strokeDasharray="5 5"
              strokeOpacity={0.4}
            />
          ))}

          {/* Peak markers as vertical reference lines */}
          {visiblePeaks.map((peak, i) => (
            <ReferenceLine
              key={`peak-${peak.axis}-${i}`}
              x={peak.frequency}
              stroke={PEAK_COLORS[peak.type] || '#aaa'}
              strokeDasharray="3 3"
              strokeOpacity={0.6}
              label={{
                value: `${PEAK_LABELS[peak.type] || peak.type} ${peak.frequency.toFixed(0)}Hz`,
                position: 'top',
                style: { fontSize: 9, fill: PEAK_COLORS[peak.type] || '#aaa' },
              }}
            />
          ))}
        </LineChart>
      </div>
    </div>
  );
}
