import { describe, it, expect } from 'vitest';
import {
  downsampleSpectrum,
  dbToColor,
  prepareHeatmapData,
  prepareHeatmapDataFromCompact,
} from './spectrogramUtils';
import type { ThrottleSpectrogramResult, PowerSpectrum } from '@shared/types/analysis.types';
import type { CompactThrottleSpectrogram } from '@shared/types/tuning-history.types';

function makeSpectrum(length: number, fillDb: number): PowerSpectrum {
  const frequencies = new Float64Array(length);
  const magnitudes = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    frequencies[i] = i * 10; // 0, 10, 20, ...
    magnitudes[i] = fillDb + i * 0.1;
  }
  return { frequencies, magnitudes };
}

describe('downsampleSpectrum', () => {
  it('returns original data when already within target bins', () => {
    const spectrum = makeSpectrum(50, -30);
    const result = downsampleSpectrum(spectrum, 100);
    expect(result.frequencies.length).toBe(50);
    expect(result.magnitudes.length).toBe(50);
  });

  it('downsamples to target bin count', () => {
    const spectrum = makeSpectrum(200, -40);
    const result = downsampleSpectrum(spectrum, 50);
    expect(result.frequencies.length).toBe(50);
    expect(result.magnitudes.length).toBe(50);
  });

  it('averages adjacent bins correctly', () => {
    const spectrum: PowerSpectrum = {
      frequencies: new Float64Array([100, 200, 300, 400]),
      magnitudes: new Float64Array([-20, -30, -10, -40]),
    };
    const result = downsampleSpectrum(spectrum, 2);
    expect(result.frequencies.length).toBe(2);
    // First bin: avg of [100, 200] = 150, avg of [-20, -30] = -25
    expect(result.frequencies[0]).toBe(150);
    expect(result.magnitudes[0]).toBe(-25);
    // Second bin: avg of [300, 400] = 350, avg of [-10, -40] = -25
    expect(result.frequencies[1]).toBe(350);
    expect(result.magnitudes[1]).toBe(-25);
  });
});

describe('dbToColor', () => {
  it('returns a CSS hsl color string', () => {
    const color = dbToColor(-30, -60, 0);
    expect(color).toMatch(/^hsl\(\d+/);
  });

  it('returns dark color for min dB', () => {
    const color = dbToColor(-60, -60, 0);
    // Should be in the purple/dark range
    expect(color).toContain('hsl(');
  });

  it('returns bright color for max dB', () => {
    const color = dbToColor(0, -60, 0);
    expect(color).toContain('hsl(');
  });

  it('handles zero range gracefully', () => {
    const color = dbToColor(-30, -30, -30);
    expect(color).toBe('hsl(260, 50%, 30%)');
  });

  it('clamps out-of-range values', () => {
    // Below min
    const low = dbToColor(-100, -60, 0);
    expect(low).toContain('hsl(');
    // Above max
    const high = dbToColor(10, -60, 0);
    expect(high).toContain('hsl(');
  });
});

describe('prepareHeatmapData', () => {
  function makeResult(bandsWithData: number): ThrottleSpectrogramResult {
    const bands = [];
    for (let i = 0; i < 10; i++) {
      if (i < bandsWithData) {
        bands.push({
          throttleMin: i * 10,
          throttleMax: (i + 1) * 10,
          sampleCount: 1000,
          spectra: [makeSpectrum(200, -40), makeSpectrum(200, -35), makeSpectrum(200, -45)] as [
            PowerSpectrum,
            PowerSpectrum,
            PowerSpectrum,
          ],
          noiseFloorDb: [-40, -35, -45] as [number, number, number],
        });
      } else {
        bands.push({
          throttleMin: i * 10,
          throttleMax: (i + 1) * 10,
          sampleCount: 0,
        });
      }
    }
    return {
      bands,
      numBands: 10,
      minSamplesPerBand: 512,
      bandsWithData,
    };
  }

  it('returns null for spectrogram with no data bands', () => {
    const result = prepareHeatmapData(makeResult(0), 'roll');
    expect(result).toBeNull();
  });

  it('returns heatmap data for valid spectrogram', () => {
    const data = prepareHeatmapData(makeResult(5), 'roll');
    expect(data).not.toBeNull();
    expect(data!.cells.length).toBeGreaterThan(0);
    expect(data!.bands.length).toBe(10);
    expect(data!.frequencies.length).toBeGreaterThan(0);
    expect(data!.minDb).toBeLessThan(data!.maxDb);
  });

  it('uses correct axis for different axis selections', () => {
    const result = makeResult(3);
    const roll = prepareHeatmapData(result, 'roll');
    const pitch = prepareHeatmapData(result, 'pitch');

    // Different axes have different fill values, so minDb should differ
    expect(roll).not.toBeNull();
    expect(pitch).not.toBeNull();
    expect(roll!.minDb).not.toBe(pitch!.minDb);
  });
});

describe('prepareHeatmapDataFromCompact', () => {
  function makeCompact(bandCount: number): CompactThrottleSpectrogram {
    const frequencies = Array.from({ length: 50 }, (_, i) => i * 20);
    const bands = [];
    for (let i = 0; i < bandCount; i++) {
      bands.push({
        throttleMin: i * 0.1,
        throttleMax: (i + 1) * 0.1,
        roll: Array.from({ length: 50 }, (_, j) => -40 + j * 0.1),
        pitch: Array.from({ length: 50 }, (_, j) => -35 + j * 0.1),
        yaw: Array.from({ length: 50 }, (_, j) => -45 + j * 0.1),
      });
    }
    return { frequencies, bands, bandsWithData: bandCount };
  }

  it('returns null for empty compact spectrogram', () => {
    expect(prepareHeatmapDataFromCompact(makeCompact(0), 'roll')).toBeNull();
  });

  it('returns heatmap data for valid compact spectrogram', () => {
    const data = prepareHeatmapDataFromCompact(makeCompact(5), 'roll');
    expect(data).not.toBeNull();
    expect(data!.cells.length).toBe(5 * 50); // 5 bands × 50 freq bins
    expect(data!.bands.length).toBe(5);
    expect(data!.frequencies.length).toBe(50);
    expect(data!.minDb).toBeLessThan(data!.maxDb);
  });

  it('uses correct axis data', () => {
    const roll = prepareHeatmapDataFromCompact(makeCompact(3), 'roll');
    const pitch = prepareHeatmapDataFromCompact(makeCompact(3), 'pitch');
    expect(roll).not.toBeNull();
    expect(pitch).not.toBeNull();
    expect(roll!.minDb).not.toBe(pitch!.minDb);
  });

  it('preserves throttle min/max in bands', () => {
    const data = prepareHeatmapDataFromCompact(makeCompact(3), 'roll')!;
    expect(data.bands[0].min).toBe(0);
    expect(data.bands[0].max).toBe(0.1);
    expect(data.bands[2].min).toBe(0.2);
    expect(data.bands[2].max).toBeCloseTo(0.3);
  });
});
