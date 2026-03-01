/**
 * Bayesian optimization for multi-flight PID convergence.
 *
 * Builds a Gaussian Process model from tuning history, mapping
 * PID gains → performance metrics, and suggests optimal next gains
 * via Expected Improvement acquisition.
 *
 * Requires at least 3 completed tuning sessions with PID metrics.
 */
import type { CompletedTuningRecord, AxisPIDSummary } from '@shared/types/tuning-history.types';
import type {
  BayesianObservation,
  AxisOptimizationResult,
  BayesianOptimizationResult,
} from '@shared/types/analysis.types';
import type { FlightStyle } from '@shared/types/profile.types';
import {
  P_GAIN_MIN,
  P_GAIN_MAX,
  D_GAIN_MIN,
  D_GAIN_MAX,
  PID_STYLE_THRESHOLDS,
  BAYESIAN_MIN_HISTORY,
  BAYESIAN_NOISE_VARIANCE,
  BAYESIAN_SIGNAL_VARIANCE,
  BAYESIAN_LENGTH_SCALE_FACTOR,
  BAYESIAN_P_STEP,
  BAYESIAN_D_STEP,
  BAYESIAN_EXPLORATION_WEIGHT,
  BAYESIAN_WEIGHT_OVERSHOOT,
  BAYESIAN_WEIGHT_RISE_TIME,
  BAYESIAN_WEIGHT_SETTLING,
  BAYESIAN_POOR_QUALITY_WEIGHT,
} from './constants';

const AXIS_NAMES = ['roll', 'pitch', 'yaw'] as const;

/**
 * Compute a scalar objective from step response metrics (lower = better).
 * Normalizes each metric relative to ideal thresholds from the flight style.
 */
export function computeObjective(
  metrics: { overshoot: number; riseTimeMs: number; settlingTimeMs: number },
  flightStyle: FlightStyle = 'balanced'
): number {
  const thresholds = PID_STYLE_THRESHOLDS[flightStyle];
  const overshootTerm =
    BAYESIAN_WEIGHT_OVERSHOOT *
    Math.pow(
      Math.max(0, metrics.overshoot - thresholds.overshootIdeal) / thresholds.overshootMax,
      2
    );
  const riseTerm =
    BAYESIAN_WEIGHT_RISE_TIME * Math.pow(metrics.riseTimeMs / thresholds.sluggishRise, 2);
  const settlingTerm =
    BAYESIAN_WEIGHT_SETTLING * Math.pow(metrics.settlingTimeMs / thresholds.settlingMax, 2);
  return overshootTerm + riseTerm + settlingTerm;
}

/**
 * Extract per-axis observations from completed tuning history.
 * Each record with valid PID metrics yields one observation per axis.
 */
export function extractObservations(
  history: CompletedTuningRecord[],
  flightStyle: FlightStyle = 'balanced'
): { roll: BayesianObservation[]; pitch: BayesianObservation[]; yaw: BayesianObservation[] } {
  const result = {
    roll: [] as BayesianObservation[],
    pitch: [] as BayesianObservation[],
    yaw: [] as BayesianObservation[],
  };

  for (const record of history) {
    if (!record.pidMetrics) continue;
    const pids = record.pidMetrics.currentPIDs;
    const tier = record.pidMetrics.dataQuality?.tier;

    for (const axisName of AXIS_NAMES) {
      const axisSummary: AxisPIDSummary = record.pidMetrics[axisName];
      if (axisSummary.meanOvershoot === 0 && axisSummary.meanRiseTimeMs === 0) continue;

      const metrics = {
        overshoot: axisSummary.meanOvershoot,
        riseTimeMs: axisSummary.meanRiseTimeMs,
        settlingTimeMs: axisSummary.meanSettlingTimeMs,
      };
      result[axisName].push({
        gains: { P: pids[axisName].P, D: pids[axisName].D },
        metrics,
        objectiveValue: computeObjective(metrics, flightStyle),
        dataQualityTier: tier,
      });
    }
  }

  return result;
}

/**
 * Squared exponential (RBF) kernel.
 */
function rbfKernel(
  x1: number[],
  x2: number[],
  lengthScales: number[],
  signalVariance: number
): number {
  let sumSq = 0;
  for (let i = 0; i < x1.length; i++) {
    const diff = (x1[i] - x2[i]) / lengthScales[i];
    sumSq += diff * diff;
  }
  return signalVariance * Math.exp(-0.5 * sumSq);
}

/**
 * Cholesky decomposition of a positive-definite matrix.
 * Returns lower triangular L such that A = L * L^T.
 */
export function choleskyDecomposition(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        const diag = A[i][i] - sum;
        L[i][j] = Math.sqrt(Math.max(diag, 1e-10));
      } else {
        L[i][j] = L[j][j] > 1e-10 ? (A[i][j] - sum) / L[j][j] : 0;
      }
    }
  }
  return L;
}

/**
 * Solve L * x = b (forward substitution) where L is lower triangular.
 */
function solveLower(L: number[][], b: number[]): number[] {
  const n = L.length;
  const x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < i; j++) {
      sum += L[i][j] * x[j];
    }
    x[i] = L[i][i] > 1e-10 ? (b[i] - sum) / L[i][i] : 0;
  }
  return x;
}

/**
 * Solve L^T * x = b (back substitution) where L is lower triangular.
 */
function solveUpper(L: number[][], b: number[]): number[] {
  const n = L.length;
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += L[j][i] * x[j]; // L^T[i][j] = L[j][i]
    }
    x[i] = L[i][i] > 1e-10 ? (b[i] - sum) / L[i][i] : 0;
  }
  return x;
}

/**
 * GP prediction: mean and variance at a test point.
 */
function gpPredict(
  xStar: number[],
  X: number[][],
  y: number[],
  L: number[][],
  lengthScales: number[],
  signalVariance: number,
  noiseVariance: number
): { mean: number; variance: number } {
  const n = X.length;
  if (n === 0) return { mean: 0, variance: signalVariance };

  // k* = kernel vector between test point and training points
  const kStar = new Array(n);
  for (let i = 0; i < n; i++) {
    kStar[i] = rbfKernel(xStar, X[i], lengthScales, signalVariance);
  }

  // α = (K + σ²_n I)^{-1} y via Cholesky
  const alpha = solveUpper(L, solveLower(L, y));

  // μ = k*^T α
  let mean = 0;
  for (let i = 0; i < n; i++) {
    mean += kStar[i] * alpha[i];
  }

  // v = L \ k*
  const v = solveLower(L, kStar);

  // σ² = k** - v^T v
  const kStarStar = rbfKernel(xStar, xStar, lengthScales, signalVariance);
  let vDotV = 0;
  for (let i = 0; i < n; i++) {
    vDotV += v[i] * v[i];
  }
  const variance = Math.max(kStarStar - vDotV, 1e-10);

  return { mean, variance };
}

/**
 * Standard normal CDF approximation (Abramowitz and Stegun).
 */
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327; // 1/sqrt(2π)
  const p =
    d *
    Math.exp(-0.5 * x * x) *
    (t *
      (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))));
  return x >= 0 ? 1 - p : p;
}

/**
 * Standard normal PDF.
 */
function normalPDF(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Expected Improvement acquisition function.
 * EI(x) = (f_best - μ) Φ(Z) + σ φ(Z) where Z = (f_best - μ) / σ
 */
function expectedImprovement(
  mean: number,
  variance: number,
  fBest: number,
  xi: number = 0
): number {
  const sigma = Math.sqrt(variance);
  if (sigma < 1e-10) return Math.max(0, fBest - mean);
  const z = (fBest - mean - xi) / sigma;
  return (fBest - mean - xi) * normalCDF(z) + sigma * normalPDF(z);
}

/**
 * Estimate GP length scales from observation data spread.
 */
function estimateLengthScales(observations: BayesianObservation[]): number[] {
  const pValues = observations.map((o) => o.gains.P);
  const dValues = observations.map((o) => o.gains.D);

  const pRange = Math.max(...pValues) - Math.min(...pValues);
  const dRange = Math.max(...dValues) - Math.min(...dValues);

  return [
    Math.max(pRange * BAYESIAN_LENGTH_SCALE_FACTOR, BAYESIAN_P_STEP),
    Math.max(dRange * BAYESIAN_LENGTH_SCALE_FACTOR, BAYESIAN_D_STEP),
  ];
}

/**
 * Optimize one axis using Gaussian Process + Expected Improvement.
 */
export function optimizeAxis(
  observations: BayesianObservation[]
): AxisOptimizationResult | undefined {
  if (observations.length < BAYESIAN_MIN_HISTORY) return undefined;

  // Prepare training data with quality weighting
  const X: number[][] = [];
  const y: number[] = [];

  for (const obs of observations) {
    X.push([obs.gains.P, obs.gains.D]);
    // Weight poor quality sessions higher (worse objective) to reduce their influence
    const qualityWeight =
      obs.dataQualityTier === 'poor' || obs.dataQualityTier === 'fair'
        ? 1 / BAYESIAN_POOR_QUALITY_WEIGHT
        : 1;
    y.push(obs.objectiveValue * qualityWeight);
  }

  const n = X.length;
  const lengthScales = estimateLengthScales(observations);
  const signalVariance = BAYESIAN_SIGNAL_VARIANCE;
  const noiseVariance = BAYESIAN_NOISE_VARIANCE;

  // Build kernel matrix K + σ²_n I
  const K: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      const kij = rbfKernel(X[i], X[j], lengthScales, signalVariance);
      K[i][j] = kij + (i === j ? noiseVariance : 0);
      K[j][i] = K[i][j];
    }
  }

  // Cholesky decomposition
  const L = choleskyDecomposition(K);

  // Find best observed objective
  const fBest = Math.min(...y);

  // Grid search over gain space
  let bestEI = -Infinity;
  let bestP = observations[0].gains.P;
  let bestD = observations[0].gains.D;
  let bestPredicted = Infinity;

  for (let p = P_GAIN_MIN; p <= P_GAIN_MAX; p += BAYESIAN_P_STEP) {
    for (let d = D_GAIN_MIN; d <= D_GAIN_MAX; d += BAYESIAN_D_STEP) {
      const { mean, variance } = gpPredict(
        [p, d],
        X,
        y,
        L,
        lengthScales,
        signalVariance,
        noiseVariance
      );
      const ei = expectedImprovement(mean, variance, fBest, BAYESIAN_EXPLORATION_WEIGHT);
      if (ei > bestEI) {
        bestEI = ei;
        bestP = p;
        bestD = d;
        bestPredicted = mean;
      }
    }
  }

  // Determine confidence based on observation count and EI magnitude
  let confidence: 'high' | 'medium' | 'low';
  if (n >= 6 && bestEI > 0.01) {
    confidence = 'high';
  } else if (n >= 4 && bestEI > 0.001) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    suggestedP: bestP,
    suggestedD: bestD,
    expectedImprovement: bestEI,
    confidence,
    predictedObjective: bestPredicted,
    observationCount: n,
  };
}

/**
 * Run Bayesian optimization across all axes using tuning history.
 *
 * @param history - Completed tuning records for the current profile
 * @param flightStyle - Pilot's flying style (affects objective function)
 * @returns Optimization result, or result with usedBayesian=false if insufficient history
 */
export function optimizeWithHistory(
  history: CompletedTuningRecord[],
  flightStyle: FlightStyle = 'balanced'
): BayesianOptimizationResult {
  // Filter to records that have PID metrics
  const validRecords = history.filter((r) => r.pidMetrics !== null);

  if (validRecords.length < BAYESIAN_MIN_HISTORY) {
    return {
      historySessionsUsed: validRecords.length,
      usedBayesian: false,
    };
  }

  const observations = extractObservations(validRecords, flightStyle);
  const result: BayesianOptimizationResult = {
    historySessionsUsed: validRecords.length,
    usedBayesian: true,
  };

  for (const axisName of AXIS_NAMES) {
    const axisObs = observations[axisName];
    if (axisObs.length >= BAYESIAN_MIN_HISTORY) {
      const axisResult = optimizeAxis(axisObs);
      if (axisResult) {
        result[axisName] = axisResult;
      }
    }
  }

  // If no axis had enough data, mark as not used
  if (!result.roll && !result.pitch && !result.yaw) {
    result.usedBayesian = false;
  }

  return result;
}
