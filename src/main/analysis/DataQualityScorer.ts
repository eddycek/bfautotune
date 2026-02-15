/**
 * Data quality scoring for flight analysis input data.
 *
 * Computes a 0-100 quality score before analysis to communicate
 * confidence in results and generate specific warnings.
 */
import type {
  AnalysisWarning,
  DataQualityScore,
  DataQualitySubScore,
  FilterRecommendation,
  FlightSegment,
  PIDRecommendation,
  StepResponse,
} from '@shared/types/analysis.types';

// ---- Tier mapping ----

function tierFromScore(score: number): DataQualityScore['tier'] {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

/** Clamp a value to 0-100 */
function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ---- Filter data quality ----

export interface FilterQualityInput {
  segments: FlightSegment[];
  hasSweepSegments: boolean;
  flightDurationS: number;
}

/**
 * Score the quality of filter analysis input data.
 *
 * Sub-scores:
 * - Segment count (weight 0.20): 3+ segments = 100, 0 = 0
 * - Total hover time (weight 0.35): 5s+ = 100, <0.5s = 0
 * - Throttle coverage (weight 0.25): 40%+ range = 100, <10% = 0
 * - Segment type (weight 0.20): sweep segments = 100, fallback = 0
 */
export function scoreFilterDataQuality(input: FilterQualityInput): {
  score: DataQualityScore;
  warnings: AnalysisWarning[];
} {
  const { segments, hasSweepSegments } = input;
  const warnings: AnalysisWarning[] = [];

  // Sub-score: segment count (0-3 → 0-100)
  const segCount = segments.length;
  const segCountScore = clamp100((segCount / 3) * 100);

  if (segCount < 2) {
    warnings.push({
      code: 'few_segments',
      message: `Only ${segCount} flight segment${segCount !== 1 ? 's' : ''} found. For best results, fly at least 3 stable hover periods of 2+ seconds each.`,
      severity: 'warning',
    });
  }

  // Sub-score: total hover time
  const totalHoverTime = segments.reduce((sum, s) => sum + s.durationSeconds, 0);
  // Linear 0.5s→0, 5s→100
  const hoverTimeScore = clamp100(((totalHoverTime - 0.5) / 4.5) * 100);

  if (totalHoverTime < 2) {
    warnings.push({
      code: 'short_hover_time',
      message: `Total hover time is ${totalHoverTime.toFixed(1)}s. At least 5 seconds of stable hover data is recommended for reliable filter analysis.`,
      severity: totalHoverTime < 0.5 ? 'error' : 'warning',
    });
  }

  // Sub-score: throttle coverage
  let throttleCoverage = 0;
  if (segments.length > 0) {
    const minThrottle = Math.min(...segments.map((s) => s.averageThrottle));
    const maxThrottle = Math.max(...segments.map((s) => s.averageThrottle));
    throttleCoverage = maxThrottle - minThrottle;
  }
  // Linear 10%→0, 40%→100
  const throttleScore = clamp100(((throttleCoverage - 10) / 30) * 100);

  if (throttleCoverage < 20 && segments.length > 0) {
    warnings.push({
      code: 'narrow_throttle_coverage',
      message: `Throttle coverage is only ${throttleCoverage.toFixed(0)}%. Fly smooth throttle sweeps covering a wider range for noise analysis across different RPMs.`,
      severity: 'warning',
    });
  }

  // Sub-score: segment type (sweep vs fallback)
  const segTypeScore = hasSweepSegments ? 100 : 0;

  const subScores: DataQualitySubScore[] = [
    { name: 'Segment count', score: segCountScore, weight: 0.2 },
    { name: 'Hover time', score: hoverTimeScore, weight: 0.35 },
    { name: 'Throttle coverage', score: throttleScore, weight: 0.25 },
    { name: 'Segment type', score: segTypeScore, weight: 0.2 },
  ];

  const overall = clamp100(subScores.reduce((sum, s) => sum + s.score * s.weight, 0));

  return {
    score: { overall, tier: tierFromScore(overall), subScores },
    warnings,
  };
}

// ---- PID data quality ----

export interface PIDQualityInput {
  totalSteps: number;
  axisResponses: {
    roll: StepResponse[];
    pitch: StepResponse[];
    yaw: StepResponse[];
  };
}

/**
 * Score the quality of PID analysis input data.
 *
 * Sub-scores:
 * - Step count (weight 0.30): 15+ steps = 100, 0 = 0
 * - Axis coverage (weight 0.30): 3 axes with 3+ steps each = 100
 * - Magnitude variety (weight 0.20): varied step sizes = 100
 * - Hold quality (weight 0.20): sufficient hold duration = 100
 */
export function scorePIDDataQuality(input: PIDQualityInput): {
  score: DataQualityScore;
  warnings: AnalysisWarning[];
} {
  const { totalSteps, axisResponses } = input;
  const warnings: AnalysisWarning[] = [];

  // Sub-score: step count (0-15 → 0-100)
  const stepCountScore = clamp100((totalSteps / 15) * 100);

  if (totalSteps < 5) {
    warnings.push({
      code: 'few_steps',
      message: `Only ${totalSteps} step input${totalSteps !== 1 ? 's' : ''} detected. Perform at least 15 quick stick snaps across all axes for reliable PID analysis.`,
      severity: totalSteps === 0 ? 'error' : 'warning',
    });
  }

  // Sub-score: axis coverage
  const axesCounts = [
    axisResponses.roll.length,
    axisResponses.pitch.length,
    axisResponses.yaw.length,
  ];
  const axisNames = ['Roll', 'Pitch', 'Yaw'];
  const axesWithEnough = axesCounts.filter((c) => c >= 3).length;
  const axisCoverageScore = clamp100((axesWithEnough / 3) * 100);

  for (let i = 0; i < 3; i++) {
    if (axesCounts[i] === 0) {
      warnings.push({
        code: 'missing_axis_coverage',
        message: `No step inputs detected on ${axisNames[i]} axis. Include stick snaps on all axes for complete PID analysis.`,
        severity: 'warning',
      });
    } else if (axesCounts[i] < 3) {
      warnings.push({
        code: 'few_steps_per_axis',
        message: `Only ${axesCounts[i]} step${axesCounts[i] !== 1 ? 's' : ''} on ${axisNames[i]} axis. At least 3 steps per axis recommended.`,
        severity: 'warning',
      });
    }
  }

  // Sub-score: magnitude variety
  const allMagnitudes = [...axisResponses.roll, ...axisResponses.pitch, ...axisResponses.yaw].map(
    (r) => Math.abs(r.step.magnitude)
  );

  let magnitudeScore = 0;
  if (allMagnitudes.length > 0) {
    const meanMag = allMagnitudes.reduce((a, b) => a + b, 0) / allMagnitudes.length;

    if (meanMag < 200 && allMagnitudes.length > 0) {
      warnings.push({
        code: 'low_step_magnitude',
        message: `Average step magnitude is ${meanMag.toFixed(0)} deg/s. Harder stick snaps (200+ deg/s) produce clearer step responses.`,
        severity: 'warning',
      });
    }

    if (allMagnitudes.length >= 2) {
      const stdDev = Math.sqrt(
        allMagnitudes.reduce((sum, m) => sum + (m - meanMag) ** 2, 0) / allMagnitudes.length
      );
      // Coefficient of variation — 0.3+ is good variety
      const cv = meanMag > 0 ? stdDev / meanMag : 0;
      magnitudeScore = clamp100((cv / 0.3) * 100);
    } else {
      magnitudeScore = 0;
    }
  }

  // Sub-score: hold quality — based on settling time availability
  // If steps have valid (non-zero) settling times, hold was long enough
  const allResponses = [...axisResponses.roll, ...axisResponses.pitch, ...axisResponses.yaw];
  let holdScore = 0;
  if (allResponses.length > 0) {
    const validSettling = allResponses.filter((r) => r.settlingTimeMs > 0).length;
    holdScore = clamp100((validSettling / allResponses.length) * 100);
  }

  const subScores: DataQualitySubScore[] = [
    { name: 'Step count', score: stepCountScore, weight: 0.3 },
    { name: 'Axis coverage', score: axisCoverageScore, weight: 0.3 },
    { name: 'Magnitude variety', score: magnitudeScore, weight: 0.2 },
    { name: 'Hold quality', score: holdScore, weight: 0.2 },
  ];

  const overall = clamp100(subScores.reduce((sum, s) => sum + s.score * s.weight, 0));

  return {
    score: { overall, tier: tierFromScore(overall), subScores },
    warnings,
  };
}

// ---- Confidence adjustment ----

/**
 * Downgrade recommendation confidence when data quality is low.
 *
 * - excellent/good → no change
 * - fair → high→medium
 * - poor → high→medium, medium→low
 */
export function adjustFilterConfidenceByQuality(
  recommendations: FilterRecommendation[],
  tier: DataQualityScore['tier']
): FilterRecommendation[] {
  if (tier === 'excellent' || tier === 'good') return recommendations;

  return recommendations.map((rec) => {
    let confidence = rec.confidence;
    if (tier === 'fair') {
      if (confidence === 'high') confidence = 'medium';
    } else if (tier === 'poor') {
      if (confidence === 'high') confidence = 'medium';
      else if (confidence === 'medium') confidence = 'low';
    }
    return confidence !== rec.confidence ? { ...rec, confidence } : rec;
  });
}

export function adjustPIDConfidenceByQuality(
  recommendations: PIDRecommendation[],
  tier: DataQualityScore['tier']
): PIDRecommendation[] {
  if (tier === 'excellent' || tier === 'good') return recommendations;

  return recommendations.map((rec) => {
    let confidence = rec.confidence;
    if (tier === 'fair') {
      if (confidence === 'high') confidence = 'medium';
    } else if (tier === 'poor') {
      if (confidence === 'high') confidence = 'medium';
      else if (confidence === 'medium') confidence = 'low';
    }
    return confidence !== rec.confidence ? { ...rec, confidence } : rec;
  });
}
