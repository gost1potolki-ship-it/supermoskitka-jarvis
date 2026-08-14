import type { MeasurementSubmissionV1 } from '../../domain/index.js';
import {
  MeasurementSheetError,
  type MeasurementSheetGateway,
  type MeasurementSheetResult,
} from '../../application/measurement-submission/index.js';

import { omitUndefinedDeep } from './upcoming-measurement-codec.js';

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function encodeMeasurementSheetRequest(
  submission: MeasurementSubmissionV1,
): Record<string, unknown> {
  return omitUndefinedDeep({
    action: 'upsert_measurement_sheet',
    submissionId: submission.submissionId,
    address: submission.customer.address,
    name: submission.customer.name,
    phone: submission.customer.phone,
    itemSummary: submission.itemSummary,
    amount_rub: submission.preliminaryTotalRub,
    payer_text: submission.payerType === 'COMPANY' ? 'Фирма' : 'Клиент',
    apt: submission.customer.apartment,
    time: submission.preferredTime,
    source: submission.source,
  }) as Record<string, unknown>;
}

export class HttpMeasurementSheetGateway implements MeasurementSheetGateway {
  constructor(
    private readonly webhookUrl: string | undefined,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async upsertMeasurement(
    submission: MeasurementSubmissionV1,
  ): Promise<MeasurementSheetResult> {
    if (!this.webhookUrl?.trim()) {
      throw new MeasurementSheetError(
        'NOT_CONFIGURED',
        'Measurement Sheet webhook is not configured',
      );
    }

    try {
      const response = await this.fetchImpl(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(encodeMeasurementSheetRequest(submission)),
      });
      if (!response.ok) {
        throw new Error(`Unexpected HTTP status ${response.status}`);
      }
      const body = (await response.json()) as {
        ok?: unknown;
        submissionId?: unknown;
        created?: unknown;
        updated?: unknown;
        row?: unknown;
      };
      if (body.ok !== true || body.submissionId !== submission.submissionId) {
        throw new Error('Invalid measurement Sheet acknowledgement');
      }
      return {
        submissionId: submission.submissionId,
        created: body.created === true,
        updated: body.updated === true,
        ...(typeof body.row === 'number' && Number.isFinite(body.row)
          ? { row: body.row }
          : {}),
      };
    } catch (error) {
      if (error instanceof MeasurementSheetError) {
        throw error;
      }
      throw new MeasurementSheetError('REQUEST_FAILED', 'Measurement Sheet request failed');
    }
  }
}
