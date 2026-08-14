import type {
  MeasurementSheetSyncStatus,
  MeasurementSubmissionSource,
  MeasurementSubmissionV1,
  UpcomingMeasurementRecord,
} from '../../domain/index.js';
import {
  formatMeasurerPayerText,
  parseMeasurerPayerText,
} from '../../domain/measurement-financials.js';

export type UpcomingMeasurementDocument = Record<string, unknown>;

export function omitUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitUndefinedDeep);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, omitUndefinedDeep(entry)]),
    );
  }
  return value;
}

function optionalNumber(doc: UpcomingMeasurementDocument, key: string): number | undefined {
  const value = doc[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Pure canonical contract → measurer-compatible Firestore document mapping. */
export function encodeUpcomingMeasurementDocument(
  record: UpcomingMeasurementRecord,
): UpcomingMeasurementDocument {
  const { submission } = record;
  return omitUndefinedDeep({
    submissionId: submission.submissionId,
    source: submission.source,
    address: submission.customer.address,
    name: submission.customer.name,
    phone: submission.customer.phone,
    comment: submission.itemSummary,
    amount_rub: submission.measurerPayoutRub,
    payer_text: formatMeasurerPayerText(submission.measurerPayer),
    preliminaryTotalRub: submission.preliminaryTotalRub,
    measurerPayoutRub: submission.measurerPayoutRub,
    measurerPayer: submission.measurerPayer,
    customerDepositRub: submission.customerDepositRub,
    remainingBalanceRub: submission.remainingBalanceRub,
    apt: submission.customer.apartment,
    time: submission.preferredTime,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sheetSyncStatus: record.sheetSyncStatus,
    sheetSyncUpdatedAt: record.sheetSyncUpdatedAt,
    sheetSyncErrorCode: record.sheetSyncErrorCode,
    jarvisConversationId: submission.jarvis?.conversationId,
    jarvisMemoryRevision: submission.jarvis?.memoryRevision,
    jarvisQuoteId: submission.jarvis?.quoteId,
  }) as UpcomingMeasurementDocument;
}

function requiredString(doc: UpcomingMeasurementDocument, key: string): string {
  const value = doc[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`Invalid upcoming measurement field: ${key}`);
  }
  return value;
}

function optionalString(doc: UpcomingMeasurementDocument, key: string): string | undefined {
  const value = doc[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function decodeUpcomingMeasurementDocument(
  doc: UpcomingMeasurementDocument,
): UpcomingMeasurementRecord {
  const source = requiredString(doc, 'source') as MeasurementSubmissionSource;
  const status = requiredString(doc, 'sheetSyncStatus') as MeasurementSheetSyncStatus;
  if (source !== 'PRESALES_CRM' && source !== 'JARVIS') {
    throw new TypeError('Invalid upcoming measurement source');
  }
  if (status !== 'pending' && status !== 'sent' && status !== 'error') {
    throw new TypeError('Invalid sheet sync status');
  }

  const measurerPayoutRub =
    optionalNumber(doc, 'measurerPayoutRub') ?? optionalNumber(doc, 'amount_rub') ?? 0;
  const measurerPayer =
    doc.measurerPayer === 'CUSTOMER' || doc.measurerPayer === 'COMPANY'
      ? doc.measurerPayer
      : parseMeasurerPayerText(doc.payer_text) ?? 'CUSTOMER';
  let customerDepositRub = optionalNumber(doc, 'customerDepositRub');
  if (customerDepositRub === undefined) {
    customerDepositRub = measurerPayer === 'CUSTOMER' ? measurerPayoutRub : 0;
  }
  let preliminaryTotalRub = optionalNumber(doc, 'preliminaryTotalRub');
  let remainingBalanceRub = optionalNumber(doc, 'remainingBalanceRub');
  if (preliminaryTotalRub === undefined && remainingBalanceRub !== undefined) {
    preliminaryTotalRub = remainingBalanceRub + customerDepositRub;
  } else if (preliminaryTotalRub === undefined) {
    preliminaryTotalRub = customerDepositRub;
  }
  if (remainingBalanceRub === undefined) {
    remainingBalanceRub = preliminaryTotalRub - customerDepositRub;
  }
  const revision = doc.jarvisMemoryRevision;
  const jarvisConversationId = optionalString(doc, 'jarvisConversationId');
  const jarvisQuoteId = optionalString(doc, 'jarvisQuoteId');

  const submission: MeasurementSubmissionV1 = {
    submissionId: requiredString(doc, 'submissionId'),
    source,
    customer: {
      ...(optionalString(doc, 'name') ? { name: optionalString(doc, 'name') } : {}),
      phone: requiredString(doc, 'phone'),
      address: requiredString(doc, 'address'),
      ...(optionalString(doc, 'apt') ? { apartment: optionalString(doc, 'apt') } : {}),
    },
    itemSummary: requiredString(doc, 'comment'),
    ...(optionalString(doc, 'time') ? { preferredTime: optionalString(doc, 'time') } : {}),
    preliminaryTotalRub,
    measurerPayoutRub,
    measurerPayer,
    customerDepositRub,
    remainingBalanceRub,
    ...(jarvisConversationId &&
    jarvisQuoteId &&
    typeof revision === 'number' &&
    Number.isInteger(revision)
      ? {
          jarvis: {
            conversationId: jarvisConversationId,
            memoryRevision: revision,
            quoteId: jarvisQuoteId,
          },
        }
      : {}),
  };

  return {
    submission,
    createdAt: requiredString(doc, 'createdAt'),
    updatedAt: requiredString(doc, 'updatedAt'),
    sheetSyncStatus: status,
    sheetSyncUpdatedAt: requiredString(doc, 'sheetSyncUpdatedAt'),
    ...(optionalString(doc, 'sheetSyncErrorCode')
      ? { sheetSyncErrorCode: optionalString(doc, 'sheetSyncErrorCode') }
      : {}),
  };
}
