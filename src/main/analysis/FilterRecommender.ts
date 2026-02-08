/**
 * Filter recommendation engine.
 *
 * Takes a noise profile and current filter settings, then applies rule-based
 * heuristics to generate tuning recommendations with beginner-friendly explanations.
 */
import type {
  NoiseProfile,
  FilterRecommendation,
  CurrentFilterSettings,
  NoisePeak,
} from '@shared/types/analysis.types';
import { DEFAULT_FILTER_SETTINGS } from '@shared/types/analysis.types';
import {
  GYRO_LPF1_MIN_HZ,
  GYRO_LPF1_MAX_HZ,
  DTERM_LPF1_MIN_HZ,
  DTERM_LPF1_MAX_HZ,
  HIGH_NOISE_GYRO_REDUCTION_HZ,
  HIGH_NOISE_DTERM_REDUCTION_HZ,
  LOW_NOISE_GYRO_INCREASE_HZ,
  LOW_NOISE_DTERM_INCREASE_HZ,
  RESONANCE_ACTION_THRESHOLD_DB,
  RESONANCE_CUTOFF_MARGIN_HZ,
} from './constants';

/**
 * Generate filter recommendations based on noise analysis.
 *
 * @param noise - Analyzed noise profile from NoiseAnalyzer
 * @param current - Current filter settings from FC (defaults to Betaflight 4.4 defaults)
 * @returns Array of recommendations, sorted by impact
 */
export function recommend(
  noise: NoiseProfile,
  current: CurrentFilterSettings = DEFAULT_FILTER_SETTINGS
): FilterRecommendation[] {
  const recommendations: FilterRecommendation[] = [];

  // 1. Noise-floor-based lowpass adjustments
  recommendNoiseFloorAdjustments(noise, current, recommendations);

  // 2. Resonance-peak-based recommendations
  recommendResonanceFixes(noise, current, recommendations);

  // 3. Dynamic notch validation
  recommendDynamicNotchAdjustments(noise, current, recommendations);

  // Deduplicate: if multiple rules recommend the same setting, keep the more aggressive one
  return deduplicateRecommendations(recommendations);
}

/**
 * Adjust lowpass filters based on overall noise level.
 */
function recommendNoiseFloorAdjustments(
  noise: NoiseProfile,
  current: CurrentFilterSettings,
  out: FilterRecommendation[]
): void {
  const { overallLevel } = noise;

  // Skip gyro LPF noise-floor adjustment when gyro_lpf1 is disabled (0 = common in BF 4.4+ with RPM filter)
  const gyroLpfDisabled = current.gyro_lpf1_static_hz === 0;

  if (overallLevel === 'high') {
    // Noise is high → more filtering (lower cutoffs)
    if (!gyroLpfDisabled) {
      const newGyroLpf1 = clamp(
        current.gyro_lpf1_static_hz - HIGH_NOISE_GYRO_REDUCTION_HZ,
        GYRO_LPF1_MIN_HZ,
        GYRO_LPF1_MAX_HZ
      );
      if (newGyroLpf1 !== current.gyro_lpf1_static_hz) {
        out.push({
          setting: 'gyro_lpf1_static_hz',
          currentValue: current.gyro_lpf1_static_hz,
          recommendedValue: newGyroLpf1,
          reason:
            'Your gyro data has a lot of noise. Lowering the gyro lowpass filter will clean up the signal, ' +
            'which helps your flight controller respond to real movement instead of vibrations.',
          impact: 'both',
          confidence: 'high',
        });
      }
    }

    const newDtermLpf1 = clamp(
      current.dterm_lpf1_static_hz - HIGH_NOISE_DTERM_REDUCTION_HZ,
      DTERM_LPF1_MIN_HZ,
      DTERM_LPF1_MAX_HZ
    );
    if (newDtermLpf1 !== current.dterm_lpf1_static_hz) {
      out.push({
        setting: 'dterm_lpf1_static_hz',
        currentValue: current.dterm_lpf1_static_hz,
        recommendedValue: newDtermLpf1,
        reason:
          'High noise is reaching the D-term (derivative) calculation. Lowering this filter reduces motor ' +
          'heating and oscillation caused by noisy D-term output.',
        impact: 'both',
        confidence: 'high',
      });
    }
  } else if (overallLevel === 'low') {
    // Noise is low → less filtering (higher cutoffs = less latency)
    if (!gyroLpfDisabled) {
      const newGyroLpf1 = clamp(
        current.gyro_lpf1_static_hz + LOW_NOISE_GYRO_INCREASE_HZ,
        GYRO_LPF1_MIN_HZ,
        GYRO_LPF1_MAX_HZ
      );
      if (newGyroLpf1 !== current.gyro_lpf1_static_hz) {
        out.push({
          setting: 'gyro_lpf1_static_hz',
          currentValue: current.gyro_lpf1_static_hz,
          recommendedValue: newGyroLpf1,
          reason:
            'Your quad is very clean with minimal vibrations. Raising the gyro filter cutoff will give you ' +
            'faster response and sharper control with almost no downside.',
          impact: 'latency',
          confidence: 'medium',
        });
      }
    }

    const newDtermLpf1 = clamp(
      current.dterm_lpf1_static_hz + LOW_NOISE_DTERM_INCREASE_HZ,
      DTERM_LPF1_MIN_HZ,
      DTERM_LPF1_MAX_HZ
    );
    if (newDtermLpf1 !== current.dterm_lpf1_static_hz) {
      out.push({
        setting: 'dterm_lpf1_static_hz',
        currentValue: current.dterm_lpf1_static_hz,
        recommendedValue: newDtermLpf1,
        reason:
          'Low noise means the D-term filter can be relaxed for sharper stick response. ' +
          'This makes your quad feel more locked-in during fast moves.',
        impact: 'latency',
        confidence: 'medium',
      });
    }
  }
  // 'medium' → no changes needed for lowpass
}

/**
 * Recommend fixes for detected resonance peaks.
 */
function recommendResonanceFixes(
  noise: NoiseProfile,
  current: CurrentFilterSettings,
  out: FilterRecommendation[]
): void {
  // Collect significant peaks from roll and pitch
  const significantPeaks: NoisePeak[] = [];
  for (const axis of [noise.roll, noise.pitch]) {
    for (const peak of axis.peaks) {
      if (peak.amplitude >= RESONANCE_ACTION_THRESHOLD_DB) {
        significantPeaks.push(peak);
      }
    }
  }

  if (significantPeaks.length === 0) return;

  // Find the lowest significant peak frequency
  const lowestPeakFreq = Math.min(...significantPeaks.map((p) => p.frequency));

  // If the gyro LPF is disabled (0) or the peak is below the cutoff, the filter isn't catching it
  const gyroLpfDisabled = current.gyro_lpf1_static_hz === 0;
  if (gyroLpfDisabled || lowestPeakFreq < current.gyro_lpf1_static_hz) {
    const targetCutoff = clamp(
      lowestPeakFreq - RESONANCE_CUTOFF_MARGIN_HZ,
      GYRO_LPF1_MIN_HZ,
      GYRO_LPF1_MAX_HZ
    );

    // When disabled, always recommend enabling; otherwise check it's lower than current
    if (gyroLpfDisabled || targetCutoff < current.gyro_lpf1_static_hz) {
      const peakType = significantPeaks.find((p) => p.frequency === lowestPeakFreq)?.type || 'unknown';
      const typeLabel = peakType === 'frame_resonance' ? 'frame resonance'
        : peakType === 'motor_harmonic' ? 'motor harmonic'
        : peakType === 'electrical' ? 'electrical noise'
        : 'noise spike';

      const reasonText = gyroLpfDisabled
        ? `A strong ${typeLabel} was detected at ${Math.round(lowestPeakFreq)} Hz, but your gyro lowpass filter is disabled. ` +
          `Enabling it at ${targetCutoff} Hz will block this vibration.`
        : `A strong ${typeLabel} was detected at ${Math.round(lowestPeakFreq)} Hz, which is below your current ` +
          `gyro filter cutoff of ${current.gyro_lpf1_static_hz} Hz. Lowering the filter will block this vibration.`;

      out.push({
        setting: 'gyro_lpf1_static_hz',
        currentValue: current.gyro_lpf1_static_hz,
        recommendedValue: targetCutoff,
        reason: reasonText,
        impact: 'both',
        confidence: 'high',
      });
    }
  }

  // Check D-term LPF similarly
  if (lowestPeakFreq < current.dterm_lpf1_static_hz) {
    const targetCutoff = clamp(
      lowestPeakFreq - RESONANCE_CUTOFF_MARGIN_HZ,
      DTERM_LPF1_MIN_HZ,
      DTERM_LPF1_MAX_HZ
    );

    if (targetCutoff < current.dterm_lpf1_static_hz) {
      out.push({
        setting: 'dterm_lpf1_static_hz',
        currentValue: current.dterm_lpf1_static_hz,
        recommendedValue: targetCutoff,
        reason:
          `A strong resonance peak at ${Math.round(lowestPeakFreq)} Hz is getting through to the D-term. ` +
          'Lowering the D-term filter will reduce motor heat and improve flight smoothness.',
        impact: 'both',
        confidence: 'high',
      });
    }
  }
}

/**
 * Check if the dynamic notch filter range covers the detected noise peaks.
 */
function recommendDynamicNotchAdjustments(
  noise: NoiseProfile,
  current: CurrentFilterSettings,
  out: FilterRecommendation[]
): void {
  // Collect all significant peaks across axes
  const allPeaks: NoisePeak[] = [];
  for (const axis of [noise.roll, noise.pitch, noise.yaw]) {
    for (const peak of axis.peaks) {
      if (peak.amplitude >= RESONANCE_ACTION_THRESHOLD_DB) {
        allPeaks.push(peak);
      }
    }
  }

  if (allPeaks.length === 0) return;

  // Check if any peaks fall outside the dynamic notch range
  const peaksBelow = allPeaks.filter((p) => p.frequency < current.dyn_notch_min_hz);
  const peaksAbove = allPeaks.filter((p) => p.frequency > current.dyn_notch_max_hz);

  if (peaksBelow.length > 0) {
    const lowestPeak = Math.min(...peaksBelow.map((p) => p.frequency));
    const newMin = Math.max(50, Math.round(lowestPeak - 20));

    if (newMin < current.dyn_notch_min_hz) {
      out.push({
        setting: 'dyn_notch_min_hz',
        currentValue: current.dyn_notch_min_hz,
        recommendedValue: newMin,
        reason:
          `There's a noise peak at ${Math.round(lowestPeak)} Hz that falls below the dynamic notch filter's ` +
          `minimum of ${current.dyn_notch_min_hz} Hz. Lowering the minimum lets the notch filter track and remove it.`,
        impact: 'noise',
        confidence: 'medium',
      });
    }
  }

  if (peaksAbove.length > 0) {
    const highestPeak = Math.max(...peaksAbove.map((p) => p.frequency));
    const newMax = Math.min(1000, Math.round(highestPeak + 20));

    if (newMax > current.dyn_notch_max_hz) {
      out.push({
        setting: 'dyn_notch_max_hz',
        currentValue: current.dyn_notch_max_hz,
        recommendedValue: newMax,
        reason:
          `A noise peak at ${Math.round(highestPeak)} Hz is above the dynamic notch filter's ` +
          `maximum of ${current.dyn_notch_max_hz} Hz. Raising the maximum lets the notch filter catch it.`,
        impact: 'noise',
        confidence: 'medium',
      });
    }
  }
}

/**
 * Deduplicate recommendations for the same setting.
 * When multiple rules target the same setting, keep the more aggressive change.
 */
function deduplicateRecommendations(recs: FilterRecommendation[]): FilterRecommendation[] {
  const byKey = new Map<string, FilterRecommendation>();

  for (const rec of recs) {
    const existing = byKey.get(rec.setting);
    if (!existing) {
      byKey.set(rec.setting, rec);
      continue;
    }

    // For lowpass filters, "more aggressive" = lower cutoff
    if (rec.setting.includes('lpf') || rec.setting.includes('min')) {
      if (rec.recommendedValue < existing.recommendedValue) {
        // Merge: keep the more aggressive value but upgrade confidence
        byKey.set(rec.setting, {
          ...rec,
          confidence: existing.confidence === 'high' || rec.confidence === 'high' ? 'high' : 'medium',
        });
      }
    } else {
      // For max filters, more aggressive = higher value
      if (rec.recommendedValue > existing.recommendedValue) {
        byKey.set(rec.setting, {
          ...rec,
          confidence: existing.confidence === 'high' || rec.confidence === 'high' ? 'high' : 'medium',
        });
      }
    }
  }

  return Array.from(byKey.values());
}

/**
 * Generate a beginner-friendly summary of the analysis.
 */
export function generateSummary(
  noise: NoiseProfile,
  recommendations: FilterRecommendation[]
): string {
  const { overallLevel } = noise;
  const parts: string[] = [];

  if (overallLevel === 'high') {
    parts.push('Your quad has significant vibration or noise.');
  } else if (overallLevel === 'low') {
    parts.push('Your quad is running very clean!');
  } else {
    parts.push('Your noise levels are moderate.');
  }

  // Mention resonance if detected
  const allPeaks = [...noise.roll.peaks, ...noise.pitch.peaks];
  const frameRes = allPeaks.find((p) => p.type === 'frame_resonance');
  const motorHarm = allPeaks.find((p) => p.type === 'motor_harmonic');

  if (frameRes) {
    parts.push(`Frame resonance detected around ${Math.round(frameRes.frequency)} Hz.`);
  }
  if (motorHarm) {
    parts.push(`Motor harmonic noise detected around ${Math.round(motorHarm.frequency)} Hz.`);
  }

  if (recommendations.length === 0) {
    parts.push('Current filter settings look good — no changes needed.');
  } else {
    parts.push(`${recommendations.length} filter change${recommendations.length > 1 ? 's' : ''} recommended.`);
  }

  return parts.join(' ');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
