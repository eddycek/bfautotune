/**
 * Rule-based PID recommendation engine.
 *
 * Analyzes step response profiles for each axis and produces
 * beginner-friendly PID tuning recommendations with safety bounds.
 */
import type { PIDConfiguration } from '@shared/types/pid.types';
import type {
  AxisStepProfile,
  DTermEffectivenessPerAxis,
  FeedforwardContext,
  PIDRecommendation,
} from '@shared/types/analysis.types';
import type { FlightStyle } from '@shared/types/profile.types';
import { PID_STYLE_THRESHOLDS, P_GAIN_MIN, P_GAIN_MAX, D_GAIN_MIN, D_GAIN_MAX } from './constants';

const AXIS_NAMES = ['roll', 'pitch', 'yaw'] as const;

/**
 * Generate PID recommendations from step response profiles.
 *
 * When `flightPIDs` is provided (extracted from the BBL header), targets are
 * anchored to the PIDs that were active during the recorded flight. This makes
 * recommendations convergent: applying the target and re-analyzing the same
 * session yields no further changes because `target == current`.
 *
 * Fallback: when `flightPIDs` is undefined (older firmware without PID headers),
 * targets are anchored to `currentPIDs` (non-convergent but functional).
 */
export function recommendPID(
  roll: AxisStepProfile,
  pitch: AxisStepProfile,
  yaw: AxisStepProfile,
  currentPIDs: PIDConfiguration,
  flightPIDs?: PIDConfiguration,
  feedforwardContext?: FeedforwardContext,
  flightStyle: FlightStyle = 'balanced',
  dTermEffectiveness?: DTermEffectivenessPerAxis
): PIDRecommendation[] {
  const recommendations: PIDRecommendation[] = [];
  const profiles = [roll, pitch, yaw] as const;
  const thresholds = PID_STYLE_THRESHOLDS[flightStyle];

  for (let axis = 0; axis < 3; axis++) {
    const profile = profiles[axis];
    const axisName = AXIS_NAMES[axis];
    const pids = currentPIDs[axisName];
    // Anchor to flight PIDs (from BBL header) when available, else fall back to current
    const base = flightPIDs ? flightPIDs[axisName] : pids;

    // Skip axes with no step data
    if (profile.responses.length === 0) continue;

    // D-term effectiveness gate: when D is mostly amplifying noise, don't recommend increasing it
    const dTermRating = dTermEffectiveness?.[axisName]?.rating;
    const dTermNoisy = dTermRating === 'noisy';

    // Check if overshoot on this axis is FF-dominated (majority of steps)
    const ffClassified = profile.responses.filter((r) => r.ffDominated !== undefined);
    const ffDominatedCount = ffClassified.filter((r) => r.ffDominated === true).length;
    const axisFFDominated = ffClassified.length > 0 && ffDominatedCount > ffClassified.length / 2;

    // Yaw is analyzed with relaxed thresholds
    const isYaw = axis === 2;
    const overshootThreshold = isYaw ? thresholds.overshootMax * 1.5 : thresholds.overshootMax;
    const moderateOvershoot = isYaw ? thresholds.overshootMax : thresholds.moderateOvershoot;
    const sluggishRiseMs = isYaw ? thresholds.sluggishRise * 1.5 : thresholds.sluggishRise;

    // FF-dominated overshoot: skip P/D rules, recommend FF adjustment instead
    if (axisFFDominated && profile.meanOvershoot > moderateOvershoot) {
      const boost = feedforwardContext?.boost;
      // Only emit feedforward_boost recommendation once (not per-axis)
      const existingFFRec = recommendations.find((r) => r.setting === 'feedforward_boost');
      if (!existingFFRec && boost !== undefined && boost > 0) {
        const targetBoost = Math.max(0, boost - 5);
        recommendations.push({
          setting: 'feedforward_boost',
          currentValue: boost,
          recommendedValue: targetBoost,
          reason: `Overshoot on ${axisName} appears to be caused by feedforward, not P/D imbalance (${Math.round(profile.meanOvershoot)}%). Reducing feedforward_boost will tame the overshoot without losing PID responsiveness.`,
          impact: 'stability',
          confidence: 'medium',
        });
      }
      // Skip P/D overshoot rules for this axis (continue to other rules)
      // Still check ringing and settling which are PID-related
    } else if (profile.meanOvershoot > overshootThreshold) {
      // Rule 1: Severe overshoot → D-first strategy (non-FF case)
      const severity = profile.meanOvershoot / overshootThreshold;
      if (dTermNoisy) {
        // D is mostly noise — recommend P reduction + filter fix instead of D increase
        const pStep = severity > 4 ? 10 : 5;
        const targetP = clamp(base.P - pStep, P_GAIN_MIN, P_GAIN_MAX);
        if (targetP !== pids.P) {
          recommendations.push({
            setting: `pid_${axisName}_p`,
            currentValue: pids.P,
            recommendedValue: targetP,
            reason: `Overshoot on ${axisName} (${Math.round(profile.meanOvershoot)}%), but D-term is mostly amplifying noise. Reducing P instead — improve your filters before increasing D.`,
            impact: 'both',
            confidence: 'medium',
          });
        }
      } else {
        // Scale D step with overshoot severity for faster convergence
        const dStep = severity > 4 ? 15 : severity > 2 ? 10 : 5;
        const targetD = clamp(base.D + dStep, D_GAIN_MIN, D_GAIN_MAX);
        if (targetD !== pids.D) {
          recommendations.push({
            setting: `pid_${axisName}_d`,
            currentValue: pids.D,
            recommendedValue: targetD,
            reason: `Significant overshoot detected on ${axisName} (${Math.round(profile.meanOvershoot)}%). Increasing D-term dampens the bounce-back for a smoother, more controlled feel.`,
            impact: 'both',
            confidence: 'high',
          });
        }
        // Reduce P when overshoot is extreme (>2x threshold) or D is already high
        if (severity > 2 || base.D >= D_GAIN_MAX * 0.6) {
          const pStep = severity > 4 ? 10 : 5;
          const targetP = clamp(base.P - pStep, P_GAIN_MIN, P_GAIN_MAX);
          if (targetP !== pids.P) {
            recommendations.push({
              setting: `pid_${axisName}_p`,
              currentValue: pids.P,
              recommendedValue: targetP,
              reason: `${severity > 4 ? 'Extreme' : 'Significant'} overshoot on ${axisName} (${Math.round(profile.meanOvershoot)}%). Reducing P-term helps prevent the quad from overshooting its target.`,
              impact: 'both',
              confidence: 'high',
            });
          }
        }
      }
    } else if (profile.meanOvershoot > moderateOvershoot) {
      // Moderate overshoot (15-25%): increase D only (gated by D-term effectiveness)
      if (!dTermNoisy) {
        const targetD = clamp(base.D + 5, D_GAIN_MIN, D_GAIN_MAX);
        if (targetD !== pids.D) {
          recommendations.push({
            setting: `pid_${axisName}_d`,
            currentValue: pids.D,
            recommendedValue: targetD,
            reason: `Your quad overshoots on ${axisName} stick inputs (${Math.round(profile.meanOvershoot)}%). Increasing D-term will dampen the response.`,
            impact: 'stability',
            confidence: 'medium',
          });
        }
      }
    }

    // Rule 2: Sluggish response (low overshoot + slow rise) → increase P by 5 (FPVSIM guidance)
    if (
      profile.meanOvershoot < thresholds.overshootIdeal &&
      profile.meanRiseTimeMs > sluggishRiseMs
    ) {
      const targetP = clamp(base.P + 5, P_GAIN_MIN, P_GAIN_MAX);
      if (targetP !== pids.P) {
        recommendations.push({
          setting: `pid_${axisName}_p`,
          currentValue: pids.P,
          recommendedValue: targetP,
          reason: `Response is sluggish on ${axisName} (${Math.round(profile.meanRiseTimeMs)}ms rise time). A P increase will make your quad feel more locked in.`,
          impact: 'response',
          confidence: 'medium',
        });
      }
    }

    // Rule 3: Excessive ringing → increase D (gated by D-term effectiveness)
    const maxRinging = Math.max(...profile.responses.map((r) => r.ringingCount));
    if (maxRinging > thresholds.ringingMax && !dTermNoisy) {
      const targetD = clamp(base.D + 5, D_GAIN_MIN, D_GAIN_MAX);
      if (targetD !== pids.D) {
        // Don't duplicate if we already recommended D increase for overshoot
        const existingDRec = recommendations.find((r) => r.setting === `pid_${axisName}_d`);
        if (!existingDRec) {
          recommendations.push({
            setting: `pid_${axisName}_d`,
            currentValue: pids.D,
            recommendedValue: targetD,
            reason: `Oscillation detected on ${axisName} after stick moves (${maxRinging} cycles). More D-term will calm the wobble.`,
            impact: 'stability',
            confidence: 'medium',
          });
        }
      }
    }

    // Rule 4: Slow settling → might need more D or less I (gated by D-term effectiveness)
    if (
      profile.meanSettlingTimeMs > thresholds.settlingMax &&
      profile.meanOvershoot < moderateOvershoot &&
      !dTermNoisy
    ) {
      // Only if overshoot isn't the problem (settling from other causes)
      const existingDRec = recommendations.find((r) => r.setting === `pid_${axisName}_d`);
      if (!existingDRec) {
        const targetD = clamp(base.D + 5, D_GAIN_MIN, D_GAIN_MAX);
        if (targetD !== pids.D) {
          recommendations.push({
            setting: `pid_${axisName}_d`,
            currentValue: pids.D,
            recommendedValue: targetD,
            reason: `${axisName.charAt(0).toUpperCase() + axisName.slice(1)} takes ${Math.round(profile.meanSettlingTimeMs)}ms to settle. A slight D increase will help it lock in faster.`,
            impact: 'stability',
            confidence: 'low',
          });
        }
      }
    }
  }

  return recommendations;
}

/**
 * Generate a beginner-friendly summary of the PID analysis.
 */
const STYLE_CONTEXT: Record<FlightStyle, string> = {
  smooth: 'for smooth flying preferences',
  balanced: '',
  aggressive: 'optimized for racing response',
};

export function generatePIDSummary(
  roll: AxisStepProfile,
  pitch: AxisStepProfile,
  yaw: AxisStepProfile,
  recommendations: PIDRecommendation[],
  flightStyle: FlightStyle = 'balanced'
): string {
  const totalSteps = roll.responses.length + pitch.responses.length + yaw.responses.length;
  const styleContext = STYLE_CONTEXT[flightStyle];
  const styleNote = styleContext ? ` ${styleContext}` : '';

  if (totalSteps === 0) {
    return 'No step inputs detected in this flight. Try flying with quick, decisive stick movements for better PID analysis.';
  }

  if (recommendations.length === 0) {
    return `Analyzed ${totalSteps} stick inputs${styleNote}. Your PID tune looks good — response is quick with minimal overshoot. No changes recommended.`;
  }

  const hasOvershoot = recommendations.some(
    (r) => r.reason.includes('overshoot') || r.reason.includes('Overshoot')
  );
  const hasSluggish = recommendations.some(
    (r) => r.reason.includes('sluggish') || r.reason.includes('Sluggish')
  );
  const hasRinging = recommendations.some(
    (r) => r.reason.includes('scillation') || r.reason.includes('wobble')
  );

  const issues: string[] = [];
  if (hasOvershoot) issues.push('overshoot');
  if (hasSluggish) issues.push('sluggish response');
  if (hasRinging) issues.push('oscillation');

  const issueText = issues.length > 0 ? issues.join(' and ') : 'room for improvement';

  return `Analyzed ${totalSteps} stick inputs${styleNote} and found ${issueText}. ${recommendations.length} adjustment${recommendations.length === 1 ? '' : 's'} recommended — apply them for a tighter, more locked-in feel.`;
}

/**
 * Extract flight-time PIDs from a BBL log header.
 * Betaflight logs PIDs as "rollPID" → "P,I,D" (e.g. "45,80,30").
 * Returns undefined if any axis PID is missing from the header.
 */
export function extractFlightPIDs(rawHeaders: Map<string, string>): PIDConfiguration | undefined {
  const rollPID = rawHeaders.get('rollPID');
  const pitchPID = rawHeaders.get('pitchPID');
  const yawPID = rawHeaders.get('yawPID');

  if (!rollPID || !pitchPID || !yawPID) return undefined;

  const parse = (s: string): { P: number; I: number; D: number } => {
    const parts = s.split(',').map(Number);
    return { P: parts[0] || 0, I: parts[1] || 0, D: parts[2] || 0 };
  };

  return { roll: parse(rollPID), pitch: parse(pitchPID), yaw: parse(yawPID) };
}

/**
 * Extract feedforward context from BBL raw headers.
 *
 * BF 4.3+ logs feedforward parameters in the blackbox header.
 * FF is considered "active" when boost > 0 (BF default is 15).
 * Missing headers are treated as FF inactive (graceful fallback for older FW).
 */
export function extractFeedforwardContext(rawHeaders: Map<string, string>): FeedforwardContext {
  const boost = parseIntOr(rawHeaders.get('feedforward_boost'));
  const maxRateLimit = parseIntOr(rawHeaders.get('feedforward_max_rate_limit'));

  const active = (boost ?? 0) > 0;

  return {
    active,
    ...(boost !== undefined ? { boost } : {}),
    ...(maxRateLimit !== undefined ? { maxRateLimit } : {}),
  };
}

/** Parse an integer from a string, returning undefined if missing or NaN. */
function parseIntOr(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
