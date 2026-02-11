/** A single axis PID term (0-255 range) */
export interface PIDTerm {
  P: number;
  I: number;
  D: number;
}

/** PID term extended with feedforward gain */
export interface PIDFTerm extends PIDTerm {
  F: number;
}

/** PID configuration for all axes */
export interface PIDConfiguration {
  roll: PIDTerm;
  pitch: PIDTerm;
  yaw: PIDTerm;
}
