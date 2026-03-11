import type { ThrottleSpectrogramResult, PowerSpectrum } from '@shared/types/analysis.types';
import type { CompactThrottleSpectrogram } from '@shared/types/tuning-history.types';

export type Axis = 'roll' | 'pitch' | 'yaw';

export interface HeatmapCell {
  freqIndex: number;
  bandIndex: number;
  frequency: number;
  throttleMin: number;
  throttleMax: number;
  db: number;
}

export interface HeatmapData {
  cells: HeatmapCell[];
  frequencies: number[];
  bands: { min: number; max: number }[];
  minDb: number;
  maxDb: number;
}

/**
 * Downsample a PowerSpectrum to targetBins by averaging adjacent bins.
 */
export function downsampleSpectrum(
  spectrum: PowerSpectrum,
  targetBins: number
): { frequencies: number[]; magnitudes: number[] } {
  const srcLen = spectrum.frequencies.length;
  if (srcLen <= targetBins) {
    return {
      frequencies: Array.from(spectrum.frequencies),
      magnitudes: Array.from(spectrum.magnitudes),
    };
  }

  const binSize = srcLen / targetBins;
  const frequencies: number[] = [];
  const magnitudes: number[] = [];

  for (let i = 0; i < targetBins; i++) {
    const start = Math.floor(i * binSize);
    const end = Math.floor((i + 1) * binSize);
    let freqSum = 0;
    let magSum = 0;
    const count = end - start;

    for (let j = start; j < end; j++) {
      freqSum += spectrum.frequencies[j];
      magSum += spectrum.magnitudes[j];
    }

    frequencies.push(freqSum / count);
    magnitudes.push(magSum / count);
  }

  return { frequencies, magnitudes };
}

/**
 * Map a dB value to a CSS color using a viridis-inspired palette.
 * Low dB (quiet) = dark blue/purple, high dB (loud) = yellow.
 */
export function dbToColor(db: number, minDb: number, maxDb: number): string {
  const range = maxDb - minDb;
  if (range === 0) return 'hsl(260, 50%, 30%)';

  const t = Math.max(0, Math.min(1, (db - minDb) / range));

  // Viridis-inspired: purple → teal → green → yellow
  if (t < 0.25) {
    // Dark purple → blue
    const s = t / 0.25;
    return `hsl(${270 - s * 40}, ${50 + s * 20}%, ${15 + s * 10}%)`;
  } else if (t < 0.5) {
    // Blue → teal
    const s = (t - 0.25) / 0.25;
    return `hsl(${230 - s * 50}, ${70 + s * 10}%, ${25 + s * 10}%)`;
  } else if (t < 0.75) {
    // Teal → green
    const s = (t - 0.5) / 0.25;
    return `hsl(${180 - s * 60}, ${80 - s * 10}%, ${35 + s * 10}%)`;
  } else {
    // Green → yellow
    const s = (t - 0.75) / 0.25;
    return `hsl(${120 - s * 60}, ${70 + s * 20}%, ${45 + s * 15}%)`;
  }
}

const TARGET_FREQ_BINS = 120;

/**
 * Transform ThrottleSpectrogramResult into HeatmapData for rendering.
 */
export function prepareHeatmapData(
  result: ThrottleSpectrogramResult,
  axis: Axis
): HeatmapData | null {
  const axisIndex = axis === 'roll' ? 0 : axis === 'pitch' ? 1 : 2;

  // Collect bands with spectra data
  const bandsWithSpectra = result.bands.filter((b) => b.spectra);
  if (bandsWithSpectra.length === 0) return null;

  // Use first available spectrum to determine frequency grid
  const refSpectrum = bandsWithSpectra[0].spectra![axisIndex];
  const ds = downsampleSpectrum(refSpectrum, TARGET_FREQ_BINS);
  const frequencies = ds.frequencies;

  const cells: HeatmapCell[] = [];
  let minDb = Infinity;
  let maxDb = -Infinity;

  const bands: { min: number; max: number }[] = [];

  for (let bi = 0; bi < result.bands.length; bi++) {
    const band = result.bands[bi];
    bands.push({ min: band.throttleMin, max: band.throttleMax });

    if (!band.spectra) continue;

    const spectrum = band.spectra[axisIndex];
    const downsampled = downsampleSpectrum(spectrum, TARGET_FREQ_BINS);

    for (let fi = 0; fi < downsampled.magnitudes.length; fi++) {
      const db = downsampled.magnitudes[fi];
      if (db < minDb) minDb = db;
      if (db > maxDb) maxDb = db;

      cells.push({
        freqIndex: fi,
        bandIndex: bi,
        frequency: downsampled.frequencies[fi],
        throttleMin: band.throttleMin,
        throttleMax: band.throttleMax,
        db,
      });
    }
  }

  if (cells.length === 0) return null;

  return { cells, frequencies, bands, minDb, maxDb };
}

/**
 * Transform CompactThrottleSpectrogram (from history) into HeatmapData for rendering.
 */
export function prepareHeatmapDataFromCompact(
  compact: CompactThrottleSpectrogram,
  axis: Axis
): HeatmapData | null {
  if (compact.bands.length === 0) return null;

  const frequencies = compact.frequencies;
  const cells: HeatmapCell[] = [];
  let minDb = Infinity;
  let maxDb = -Infinity;

  const bands: { min: number; max: number }[] = compact.bands.map((b) => ({
    min: b.throttleMin,
    max: b.throttleMax,
  }));

  for (let bi = 0; bi < compact.bands.length; bi++) {
    const band = compact.bands[bi];
    const magnitudes = axis === 'roll' ? band.roll : axis === 'pitch' ? band.pitch : band.yaw;

    for (let fi = 0; fi < magnitudes.length; fi++) {
      const db = magnitudes[fi];
      if (db < minDb) minDb = db;
      if (db > maxDb) maxDb = db;

      cells.push({
        freqIndex: fi,
        bandIndex: bi,
        frequency: frequencies[fi],
        throttleMin: band.throttleMin,
        throttleMax: band.throttleMax,
        db,
      });
    }
  }

  if (cells.length === 0) return null;

  return { cells, frequencies, bands, minDb, maxDb };
}
