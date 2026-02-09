import { BBLPredictor } from '@shared/types/blackbox.types';
import type { BBLLogHeader } from '@shared/types/blackbox.types';

/**
 * Applies predictor-based delta decompression to decoded field values.
 *
 * In BBL format, P-frame values are typically stored as deltas from a
 * predicted value. The predictor type determines how the prediction
 * is computed. For I-frames, most predictors produce 0 (absolute encoding),
 * but some (like MINTHROTTLE) still apply their base value.
 */
export class PredictorApplier {
  /**
   * Apply predictor to a decoded value, returning the final field value.
   *
   * @param predictor - The predictor type for this field
   * @param decoded - The decoded delta/absolute value from ValueDecoder
   * @param fieldIdx - Index of this field in the frame
   * @param isIFrame - Whether this is an I-frame (affects some predictors)
   * @param previous - Previous frame's values (null for first I-frame)
   * @param previous2 - The frame before previous (for STRAIGHT_LINE/AVERAGE_2)
   * @param currentValues - Current frame's values decoded so far (for MOTOR_0)
   * @param header - Log header (for MINTHROTTLE, VBATREF constants)
   * @param motor0FieldIdx - Index of motor[0] in the field definitions
   */
  static apply(
    predictor: BBLPredictor,
    decoded: number,
    fieldIdx: number,
    isIFrame: boolean,
    previous: number[] | null,
    previous2: number[] | null,
    currentValues: number[],
    header: BBLLogHeader,
    motor0FieldIdx: number
  ): number {
    switch (predictor) {
      case BBLPredictor.ZERO:
        // No prediction - value is absolute
        return decoded;

      case BBLPredictor.PREVIOUS:
        if (isIFrame) return decoded;
        return decoded + (previous?.[fieldIdx] ?? 0);

      case BBLPredictor.STRAIGHT_LINE:
        if (isIFrame) return decoded;
        return decoded + PredictorApplier.straightLine(
          previous?.[fieldIdx] ?? 0,
          previous2?.[fieldIdx] ?? 0
        );

      case BBLPredictor.AVERAGE_2:
        if (isIFrame) return decoded;
        // When previous2 is unavailable, BF uses just previous (not average with 0)
        if (!previous2) {
          return decoded + (previous?.[fieldIdx] ?? 0);
        }
        return decoded + PredictorApplier.average2(
          previous?.[fieldIdx] ?? 0,
          previous2[fieldIdx] ?? 0
        );

      case BBLPredictor.MINTHROTTLE:
        if (isIFrame) return decoded + header.minthrottle;
        return decoded + (previous?.[fieldIdx] ?? header.minthrottle);

      case BBLPredictor.MOTOR_0:
        if (isIFrame) return decoded + currentValues[motor0FieldIdx];
        return decoded + (previous?.[fieldIdx] ?? 0);

      case BBLPredictor.INCREMENT:
        if (isIFrame) return decoded;
        return decoded + (previous?.[fieldIdx] ?? 0) + 1;

      case BBLPredictor.HOME_COORD:
        // GPS home coordinate - not needed for PID analysis
        // For I-frame: absolute, for P-frame: delta from previous
        if (isIFrame) return decoded;
        return decoded + (previous?.[fieldIdx] ?? 0);

      case BBLPredictor.SERVO_CENTER:
        // Servo center (1500) - not used for quads
        if (isIFrame) return decoded + 1500;
        return decoded + (previous?.[fieldIdx] ?? 1500);

      case BBLPredictor.VBATREF:
        if (isIFrame) return decoded + header.vbatref;
        return decoded + (previous?.[fieldIdx] ?? header.vbatref);

      default:
        return decoded;
    }
  }

  /**
   * Straight-line predictor: extrapolate linearly from last two values.
   * predicted = 2 * prev - prev2
   */
  private static straightLine(prev: number, prev2: number): number {
    return 2 * prev - prev2;
  }

  /**
   * Average of last two values (integer division, floor).
   */
  private static average2(prev: number, prev2: number): number {
    return (prev + prev2) >> 1;
  }
}
