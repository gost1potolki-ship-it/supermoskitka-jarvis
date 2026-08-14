import type {
  MeasurementSubmissionV1,
  UpcomingMeasurementRecord,
} from '../../domain/index.js';

export interface UpcomingMeasurementStore {
  upsertPending(submission: MeasurementSubmissionV1, now: string): Promise<void>;
  markSheetSent(submissionId: string, now: string): Promise<void>;
  markSheetError(submissionId: string, now: string, errorCode: string): Promise<void>;
  get(submissionId: string): Promise<UpcomingMeasurementRecord | null>;
}

export interface MeasurementSheetResult {
  submissionId: string;
  created: boolean;
  updated: boolean;
  row?: number;
}

export interface MeasurementSheetGateway {
  upsertMeasurement(submission: MeasurementSubmissionV1): Promise<MeasurementSheetResult>;
}

export interface MeasurementSubmissionClock {
  now(): string;
}

export interface MeasurementSubmissionLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
}
