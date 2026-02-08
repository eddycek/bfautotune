import React from 'react';
import './RecommendationCard.css';

interface RecommendationCardProps {
  setting: string;
  currentValue: number;
  recommendedValue: number;
  reason: string;
  impact: string;
  confidence: 'high' | 'medium' | 'low';
}

export function RecommendationCard({
  setting,
  currentValue,
  recommendedValue,
  reason,
  impact,
  confidence,
}: RecommendationCardProps) {
  return (
    <div className="recommendation-card">
      <div className="recommendation-card-header">
        <span className="recommendation-card-setting">{setting}</span>
        <span className={`recommendation-card-confidence ${confidence}`}>
          {confidence.toUpperCase()}
        </span>
      </div>
      <div className="recommendation-card-values">
        <span className="recommendation-card-current">{currentValue}</span>
        <span className="recommendation-card-arrow">&rarr;</span>
        <span className="recommendation-card-recommended">{recommendedValue}</span>
      </div>
      <p className="recommendation-card-reason">{reason}</p>
      <span className="recommendation-card-impact">{impact}</span>
    </div>
  );
}
