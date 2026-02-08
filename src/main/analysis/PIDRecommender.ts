/**
 * Rule-based PID recommendation engine.
 *
 * Analyzes step response profiles for each axis and produces
 * beginner-friendly PID tuning recommendations with safety bounds.
 */
import type { PIDConfiguration } from '@shared/types/pid.types';
import type { AxisStepProfile, PIDRecommendation } from '@shared/types/analysis.types';
import {
  OVERSHOOT_IDEAL_PERCENT,
  OVERSHOOT_MAX_PERCENT,
  RINGING_MAX_COUNT,
  SETTLING_MAX_MS,
  P_GAIN_MIN,
  P_GAIN_MAX,
  D_GAIN_MIN,
  D_GAIN_MAX,
  I_GAIN_MIN,
  I_GAIN_MAX,
} from './constants';

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
  flightPIDs?: PIDConfiguration
): PIDRecommendation[] {
  const recommendations: PIDRecommendation[] = [];
  const profiles = [roll, pitch, yaw] as const;

  for (let axis = 0; axis < 3; axis++) {
    const profile = profiles[axis];
    const axisName = AXIS_NAMES[axis];
    const pids = currentPIDs[axisName];
    // Anchor to flight PIDs (from BBL header) when available, else fall back to current
    const base = flightPIDs ? flightPIDs[axisName] : pids;

    // Skip axes with no step data
    if (profile.responses.length === 0) continue;

    // Yaw is analyzed with relaxed thresholds
    const isYaw = axis === 2;
    const overshootThreshold = isYaw ? OVERSHOOT_MAX_PERCENT * 1.5 : OVERSHOOT_MAX_PERCENT;
    const moderateOvershoot = isYaw ? OVERSHOOT_MAX_PERCENT : 15;
    const sluggishRiseMs = isYaw ? 120 : 80;

    // Rule 1: Severe overshoot → D-first strategy (BF guide: increase D for bounce-back)
    if (profile.meanOvershoot > overshootThreshold) {
      // Always increase D first (anchored to flight PIDs)
      const targetD = clamp(base.D + 5, D_GAIN_MIN, D_GAIN_MAX);
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
      // Only also reduce P if D is already high (≥60% of max) — D alone wasn't enough
      if (base.D >= D_GAIN_MAX * 0.6) {
        const targetP = clamp(base.P - 5, P_GAIN_MIN, P_GAIN_MAX);
        if (targetP !== pids.P) {
          recommendations.push({
            setting: `pid_${axisName}_p`,
            currentValue: pids.P,
            recommendedValue: targetP,
            reason: `Significant overshoot on ${axisName} (${Math.round(profile.meanOvershoot)}%) and D-term is already high. Reducing P-term helps prevent the quad from overshooting its target.`,
            impact: 'both',
            confidence: 'high',
          });
        }
      }
    } else if (profile.meanOvershoot > moderateOvershoot) {
      // Moderate overshoot (15-25%): increase D only
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

    // Rule 2: Sluggish response (low overshoot + slow rise) → increase P by 5 (FPVSIM guidance)
    if (profile.meanOvershoot < OVERSHOOT_IDEAL_PERCENT && profile.meanRiseTimeMs > sluggishRiseMs) {
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

    // Rule 3: Excessive ringing → increase D (BF: any visible bounce-back should be addressed)
    const maxRinging = Math.max(...profile.responses.map(r => r.ringingCount));
    if (maxRinging > RINGING_MAX_COUNT) {
      const targetD = clamp(base.D + 5, D_GAIN_MIN, D_GAIN_MAX);
      if (targetD !== pids.D) {
        // Don't duplicate if we already recommended D increase for overshoot
        const existingDRec = recommendations.find(r => r.setting === `pid_${axisName}_d`);
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

    // Rule 4: Slow settling → might need more D or less I
    if (profile.meanSettlingTimeMs > SETTLING_MAX_MS && profile.meanOvershoot < moderateOvershoot) {
      // Only if overshoot isn't the problem (settling from other causes)
      const existingDRec = recommendations.find(r => r.setting === `pid_${axisName}_d`);
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
export function generatePIDSummary(
  roll: AxisStepProfile,
  pitch: AxisStepProfile,
  yaw: AxisStepProfile,
  recommendations: PIDRecommendation[]
): string {
  const totalSteps = roll.responses.length + pitch.responses.length + yaw.responses.length;

  if (totalSteps === 0) {
    return 'No step inputs detected in this flight. Try flying with quick, decisive stick movements for better PID analysis.';
  }

  if (recommendations.length === 0) {
    return `Analyzed ${totalSteps} stick inputs. Your PID tune looks good — response is quick with minimal overshoot. No changes recommended.`;
  }

  const hasOvershoot = recommendations.some(r => r.reason.includes('overshoot') || r.reason.includes('Overshoot'));
  const hasSluggish = recommendations.some(r => r.reason.includes('sluggish') || r.reason.includes('Sluggish'));
  const hasRinging = recommendations.some(r => r.reason.includes('scillation') || r.reason.includes('wobble'));

  const issues: string[] = [];
  if (hasOvershoot) issues.push('overshoot');
  if (hasSluggish) issues.push('sluggish response');
  if (hasRinging) issues.push('oscillation');

  const issueText = issues.length > 0
    ? issues.join(' and ')
    : 'room for improvement';

  return `Analyzed ${totalSteps} stick inputs and found ${issueText}. ${recommendations.length} adjustment${recommendations.length === 1 ? '' : 's'} recommended — apply them for a tighter, more locked-in feel.`;
}

/**
 * Extract flight-time PIDs from a BBL log header.
 * Betaflight logs PIDs as "rollPID" → "P,I,D" (e.g. "45,80,30").
 * Returns undefined if any axis PID is missing from the header.
 */
export function extractFlightPIDs(
  rawHeaders: Map<string, string>
): PIDConfiguration | undefined {
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
