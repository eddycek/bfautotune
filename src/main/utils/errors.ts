export class BetaflightError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'BetaflightError';
  }
}

export class ConnectionError extends BetaflightError {
  constructor(message: string, details?: any) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'ConnectionError';
  }
}

export class MSPError extends BetaflightError {
  constructor(message: string, details?: any) {
    super(message, 'MSP_ERROR', details);
    this.name = 'MSPError';
  }
}

export class TimeoutError extends BetaflightError {
  constructor(message: string = 'Operation timed out') {
    super(message, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}

export class SnapshotError extends BetaflightError {
  constructor(message: string, details?: any) {
    super(message, 'SNAPSHOT_ERROR', details);
    this.name = 'SnapshotError';
  }
}

export function isError(error: any): error is Error {
  return error instanceof Error;
}

export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  return String(error);
}
