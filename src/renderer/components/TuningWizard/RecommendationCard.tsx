import React from 'react';
import './RecommendationCard.css';

export const SETTING_LABELS: Record<string, string> = {
  gyro_lpf1_static_hz: 'Gyro Lowpass 1',
  gyro_lpf2_static_hz: 'Gyro Lowpass 2',
  dterm_lpf1_static_hz: 'D-Term Lowpass 1',
  dterm_lpf2_static_hz: 'D-Term Lowpass 2',
  dyn_notch_min_hz: 'Dynamic Notch Min',
  dyn_notch_max_hz: 'Dynamic Notch Max',
  pid_roll_p: 'Roll P-Gain',
  pid_roll_i: 'Roll I-Gain',
  pid_roll_d: 'Roll D-Gain',
  pid_pitch_p: 'Pitch P-Gain',
  pid_pitch_i: 'Pitch I-Gain',
  pid_pitch_d: 'Pitch D-Gain',
  pid_yaw_p: 'Yaw P-Gain',
  pid_yaw_i: 'Yaw I-Gain',
  pid_yaw_d: 'Yaw D-Gain',
};

function computeChange(current: number, recommended: number): { text: string; direction: 'increase' | 'decrease' | 'none' } {
  if (current === recommended) return { text: '0%', direction: 'none' };
  if (current === 0) {
    return { text: `+${recommended}`, direction: 'increase' };
  }
  const pct = Math.round(((recommended - current) / Math.abs(current)) * 100);
  if (pct === 0) return { text: '0%', direction: 'none' };
  const sign = pct > 0 ? '+' : '';
  return {
    text: `${sign}${pct}%`,
    direction: pct > 0 ? 'increase' : 'decrease',
  };
}

interface RecommendationCardProps {
  setting: string;
  currentValue: number;
  recommendedValue: number;
  reason: string;
  impact: string;
  confidence: 'high' | 'medium' | 'low';
  unit?: string;
}

export function RecommendationCard({
  setting,
  currentValue,
  recommendedValue,
  reason,
  impact,
  confidence,
  unit,
}: RecommendationCardProps) {
  const label = SETTING_LABELS[setting] || setting;
  const change = computeChange(currentValue, recommendedValue);

  return (
    <div className="recommendation-card">
      <div className="recommendation-card-header">
        <div>
          <span className="recommendation-card-label">{label}</span>
          <span className="recommendation-card-setting">{setting}</span>
        </div>
        <span className={`recommendation-card-confidence ${confidence}`}>
          {confidence.toUpperCase()}
        </span>
      </div>
      <div className="recommendation-card-values">
        <span className="recommendation-card-current">
          {currentValue}{unit ? ` ${unit}` : ''}
        </span>
        <span className="recommendation-card-arrow">&rarr;</span>
        <span className="recommendation-card-recommended">
          {recommendedValue}{unit ? ` ${unit}` : ''}
        </span>
        {change.direction !== 'none' && (
          <span className={`recommendation-card-change ${change.direction}`}>
            {change.text}
          </span>
        )}
      </div>
      <p className="recommendation-card-reason">{reason}</p>
      <span className="recommendation-card-impact">{impact}</span>
    </div>
  );
}
