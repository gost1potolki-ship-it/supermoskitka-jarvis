import type { MeasurementSubmissionV1 } from '../../domain/index.js';
import { assertMeasurementFinancialPayload } from '../../domain/measurement-financials.js';

import { MeasurementSheetError } from './errors.js';
import type {
  MeasurementSheetGateway,
  MeasurementSubmissionClock,
  MeasurementSubmissionLogger,
  UpcomingMeasurementStore,
} from './ports.js';

export type MeasurementSubmissionResult =
  | {
      submissionId: string;
      status: 'SUBMITTED';
      firestore: 'UPSERTED';
      sheet: 'SENT';
    }
  | {
      submissionId: string;
      status: 'PARTIAL';
      firestore: 'UPSERTED';
      sheet: 'ERROR';
      errorCode: 'MEASUREMENT_SHEET_NOT_CONFIGURED' | 'MEASUREMENT_SHEET_FAILED';
    };

export class MeasurementPersistenceError extends Error {
  constructor(
    message: string,
    readonly firestoreUpserted: boolean,
  ) {
    super(message);
    this.name = 'MeasurementPersistenceError';
  }
}

const silentLogger: MeasurementSubmissionLogger = {
  info: () => undefined,
  warn: () => undefined,
};

function assertValidSubmission(submission: MeasurementSubmissionV1): void {
  if (!submission.submissionId.trim()) {
    throw new TypeError('submissionId is required');
  }
  if (!submission.customer.phone.trim()) {
    throw new TypeError('customer.phone is required');
  }
  if (!submission.customer.address.trim()) {
    throw new TypeError('customer.address is required');
  }
  assertMeasurementFinancialPayload({
    preliminaryTotalRub: submission.preliminaryTotalRub,
    measurerPayoutRub: submission.measurerPayoutRub,
    measurerPayer: submission.measurerPayer,
    customerDepositRub: submission.customerDepositRub,
    remainingBalanceRub: submission.remainingBalanceRub,
  });
}

/**
 * Explicit two-system executor. Firestore remains authoritative for app visibility;
 * a Sheet failure never rolls back the operational measurement document.
 */
export class MeasurementSubmissionService {
  private readonly logger: MeasurementSubmissionLogger;

  constructor(
    private readonly upcomingStore: UpcomingMeasurementStore,
    private readonly sheetGateway: MeasurementSheetGateway,
    private readonly clock: MeasurementSubmissionClock,
    logger?: MeasurementSubmissionLogger,
  ) {
    this.logger = logger ?? silentLogger;
  }

  async submit(submission: MeasurementSubmissionV1): Promise<MeasurementSubmissionResult> {
    assertValidSubmission(submission);
    const pendingAt = this.clock.now();

    try {
      await this.upcomingStore.upsertPending(submission, pendingAt);
    } catch {
      throw new MeasurementPersistenceError('Could not persist measurement submission', false);
    }

    try {
      await this.sheetGateway.upsertMeasurement(submission);
      await this.upcomingStore.markSheetSent(submission.submissionId, this.clock.now());
      this.logger.info('measurement_submission.completed', {
        submissionId: submission.submissionId,
        source: submission.source,
        status: 'SUBMITTED',
        sheet: 'SENT',
      });
      return {
        submissionId: submission.submissionId,
        status: 'SUBMITTED',
        firestore: 'UPSERTED',
        sheet: 'SENT',
      };
    } catch (error) {
      const errorCode =
        error instanceof MeasurementSheetError && error.code === 'NOT_CONFIGURED'
          ? 'MEASUREMENT_SHEET_NOT_CONFIGURED'
          : 'MEASUREMENT_SHEET_FAILED';
      try {
        await this.upcomingStore.markSheetError(
          submission.submissionId,
          this.clock.now(),
          errorCode,
        );
      } catch {
        throw new MeasurementPersistenceError(
          'Measurement persisted but Sheet error status could not be saved',
          true,
        );
      }
      this.logger.warn('measurement_submission.partial', {
        submissionId: submission.submissionId,
        source: submission.source,
        status: 'PARTIAL',
        sheet: 'ERROR',
        errorCode,
      });
      return {
        submissionId: submission.submissionId,
        status: 'PARTIAL',
        firestore: 'UPSERTED',
        sheet: 'ERROR',
        errorCode,
      };
    }
  }
}
