import { describe, it, expect } from 'vitest';
import { PredictorApplier } from './PredictorApplier';
import { BBLPredictor } from '@shared/types/blackbox.types';
import type { BBLLogHeader } from '@shared/types/blackbox.types';

/** Minimal header for testing */
function makeHeader(overrides: Partial<BBLLogHeader> = {}): BBLLogHeader {
  return {
    product: '', dataVersion: 2, firmwareType: 'Betaflight',
    firmwareRevision: '', firmwareDate: '', boardInformation: '',
    logStartDatetime: '', craftName: '',
    iFieldDefs: [], pFieldDefs: [], sFieldDefs: [], gFieldDefs: [],
    iInterval: 32, pInterval: 1, pDenom: 2,
    minthrottle: 1070, maxthrottle: 2000, motorOutputRange: 2047,
    vbatref: 420, looptime: 312, gyroScale: 0.0305176,
    rawHeaders: new Map(),
    ...overrides,
  };
}

describe('PredictorApplier', () => {
  const header = makeHeader();
  const motor0Idx = 5;

  describe('ZERO predictor', () => {
    it('returns decoded value unchanged for I-frame', () => {
      expect(PredictorApplier.apply(BBLPredictor.ZERO, 42, 0, true, null, null, [], header, motor0Idx)).toBe(42);
    });

    it('returns decoded value unchanged for P-frame', () => {
      expect(PredictorApplier.apply(BBLPredictor.ZERO, -10, 0, false, [100], null, [], header, motor0Idx)).toBe(-10);
    });
  });

  describe('PREVIOUS predictor', () => {
    it('returns decoded value for I-frame (no delta)', () => {
      expect(PredictorApplier.apply(BBLPredictor.PREVIOUS, 50, 0, true, null, null, [], header, motor0Idx)).toBe(50);
    });

    it('adds previous value for P-frame', () => {
      const previous = [100, 200, 300];
      expect(PredictorApplier.apply(BBLPredictor.PREVIOUS, 5, 1, false, previous, null, [], header, motor0Idx)).toBe(205);
    });

    it('handles null previous (first P-frame after I-frame loss)', () => {
      expect(PredictorApplier.apply(BBLPredictor.PREVIOUS, 5, 0, false, null, null, [], header, motor0Idx)).toBe(5);
    });

    it('handles negative delta', () => {
      expect(PredictorApplier.apply(BBLPredictor.PREVIOUS, -10, 0, false, [100], null, [], header, motor0Idx)).toBe(90);
    });
  });

  describe('STRAIGHT_LINE predictor', () => {
    it('returns decoded value for I-frame', () => {
      expect(PredictorApplier.apply(BBLPredictor.STRAIGHT_LINE, 50, 0, true, null, null, [], header, motor0Idx)).toBe(50);
    });

    it('extrapolates from previous two values for P-frame', () => {
      // predicted = 2 * 200 - 100 = 300, result = 300 + 5 = 305
      const previous = [200];
      const previous2 = [100];
      expect(PredictorApplier.apply(BBLPredictor.STRAIGHT_LINE, 5, 0, false, previous, previous2, [], header, motor0Idx)).toBe(305);
    });

    it('handles zero delta (perfect prediction)', () => {
      const previous = [200];
      const previous2 = [100];
      expect(PredictorApplier.apply(BBLPredictor.STRAIGHT_LINE, 0, 0, false, previous, previous2, [], header, motor0Idx)).toBe(300);
    });

    it('handles null previous2 by falling back to PREVIOUS', () => {
      // When previous2 is null, falls back to PREVIOUS predictor (not straightLine with 0)
      expect(PredictorApplier.apply(BBLPredictor.STRAIGHT_LINE, 0, 0, false, [100], null, [], header, motor0Idx)).toBe(100);
    });
  });

  describe('AVERAGE_2 predictor', () => {
    it('returns decoded value for I-frame', () => {
      expect(PredictorApplier.apply(BBLPredictor.AVERAGE_2, 50, 0, true, null, null, [], header, motor0Idx)).toBe(50);
    });

    it('averages previous two values for P-frame', () => {
      // avg = (200 + 100) >> 1 = 150, result = 150 + 10 = 160
      expect(PredictorApplier.apply(BBLPredictor.AVERAGE_2, 10, 0, false, [200], [100], [], header, motor0Idx)).toBe(160);
    });

    it('truncates positive odd sums toward zero (C integer division)', () => {
      // avg = Math.trunc((201 + 100) / 2) = Math.trunc(150.5) = 150
      expect(PredictorApplier.apply(BBLPredictor.AVERAGE_2, 0, 0, false, [201], [100], [], header, motor0Idx)).toBe(150);
    });

    it('truncates negative odd sums toward zero (not floor)', () => {
      // avg = Math.trunc((-201 + 100) / 2) = Math.trunc(-50.5) = -50 (toward zero, NOT -51)
      // result = -50 + 0 = -50
      expect(PredictorApplier.apply(BBLPredictor.AVERAGE_2, 0, 0, false, [-201], [100], [], header, motor0Idx)).toBe(-50);
    });

    it('truncates both-negative odd sums toward zero', () => {
      // avg = Math.trunc((-3 + -2) / 2) = Math.trunc(-2.5) = -2 (toward zero, NOT -3)
      // result = -2 + 0 = -2
      expect(PredictorApplier.apply(BBLPredictor.AVERAGE_2, 0, 0, false, [-3], [-2], [], header, motor0Idx)).toBe(-2);
    });

    it('uses just previous when previous2 is null (matches BF behavior)', () => {
      // When previous2 is null, BF uses prediction = previous[i] (not average with 0)
      // result = decoded + previous[0] = 10 + 500 = 510
      expect(PredictorApplier.apply(BBLPredictor.AVERAGE_2, 10, 0, false, [500], null, [], header, motor0Idx)).toBe(510);
    });

    it('uses just previous when previous2 is null for negative values', () => {
      // result = -5 + (-300) = -305
      expect(PredictorApplier.apply(BBLPredictor.AVERAGE_2, -5, 0, false, [-300], null, [], header, motor0Idx)).toBe(-305);
    });
  });

  describe('MINTHROTTLE predictor', () => {
    it('adds minthrottle for I-frame', () => {
      // minthrottle=1070, result = 1070 + 5 = 1075
      expect(PredictorApplier.apply(BBLPredictor.MINTHROTTLE, 5, 0, true, null, null, [], header, motor0Idx)).toBe(1075);
    });

    it('uses previous value for P-frame delta', () => {
      // P-frame: delta from previous
      expect(PredictorApplier.apply(BBLPredictor.MINTHROTTLE, 10, 0, false, [1500], null, [], header, motor0Idx)).toBe(1510);
    });

    it('falls back to minthrottle when no previous', () => {
      expect(PredictorApplier.apply(BBLPredictor.MINTHROTTLE, 0, 0, false, null, null, [], header, motor0Idx)).toBe(1070);
    });
  });

  describe('MOTOR_0 predictor', () => {
    it('adds motor[0] value from current frame for I-frame', () => {
      const currentValues = [0, 0, 0, 0, 0, 1500]; // motor0Idx=5
      expect(PredictorApplier.apply(BBLPredictor.MOTOR_0, 10, 6, true, null, null, currentValues, header, motor0Idx)).toBe(1510);
    });

    it('uses previous value for P-frame delta', () => {
      const previous = [0, 0, 0, 0, 0, 0, 1600];
      expect(PredictorApplier.apply(BBLPredictor.MOTOR_0, -50, 6, false, previous, null, [], header, motor0Idx)).toBe(1550);
    });
  });

  describe('INCREMENT predictor', () => {
    it('returns decoded value for I-frame', () => {
      expect(PredictorApplier.apply(BBLPredictor.INCREMENT, 100, 0, true, null, null, [], header, motor0Idx)).toBe(100);
    });

    it('adds previous + 1 for P-frame', () => {
      // previous=100, increment predicted=101, result = 101 + 0 = 101
      expect(PredictorApplier.apply(BBLPredictor.INCREMENT, 0, 0, false, [100], null, [], header, motor0Idx)).toBe(101);
    });

    it('handles non-zero delta in P-frame', () => {
      // previous=100, increment predicted=101, result = 101 + 2 = 103
      expect(PredictorApplier.apply(BBLPredictor.INCREMENT, 2, 0, false, [100], null, [], header, motor0Idx)).toBe(103);
    });
  });

  describe('HOME_COORD predictor', () => {
    it('returns decoded value for I-frame', () => {
      expect(PredictorApplier.apply(BBLPredictor.HOME_COORD, 123456, 0, true, null, null, [], header, motor0Idx)).toBe(123456);
    });

    it('adds previous for P-frame', () => {
      expect(PredictorApplier.apply(BBLPredictor.HOME_COORD, 5, 0, false, [123456], null, [], header, motor0Idx)).toBe(123461);
    });
  });

  describe('SERVO_CENTER predictor', () => {
    it('adds 1500 for I-frame', () => {
      expect(PredictorApplier.apply(BBLPredictor.SERVO_CENTER, 0, 0, true, null, null, [], header, motor0Idx)).toBe(1500);
    });

    it('uses previous for P-frame', () => {
      expect(PredictorApplier.apply(BBLPredictor.SERVO_CENTER, 10, 0, false, [1510], null, [], header, motor0Idx)).toBe(1520);
    });
  });

  describe('VBATREF predictor', () => {
    it('adds vbatref for I-frame', () => {
      // vbatref=420, result = 420 + 0 = 420
      expect(PredictorApplier.apply(BBLPredictor.VBATREF, 0, 0, true, null, null, [], header, motor0Idx)).toBe(420);
    });

    it('uses previous for P-frame', () => {
      expect(PredictorApplier.apply(BBLPredictor.VBATREF, -5, 0, false, [420], null, [], header, motor0Idx)).toBe(415);
    });
  });
});
