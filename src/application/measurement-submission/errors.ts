export type MeasurementSheetErrorCode = 'NOT_CONFIGURED' | 'REQUEST_FAILED';

export class MeasurementSheetError extends Error {
  constructor(
    readonly code: MeasurementSheetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MeasurementSheetError';
  }
}
