export type MeasurementSubmissionSource = 'PRESALES_CRM' | 'JARVIS';
export type MeasurementPayerType = 'CUSTOMER' | 'COMPANY';
export type MeasurementSheetSyncStatus = 'pending' | 'sent' | 'error';

/**
 * Canonical public-data-only measurement intake contract.
 * It intentionally contains no costs, margins, BOM, or quote proof internals.
 */
export interface MeasurementSubmissionV1 {
  submissionId: string;
  source: MeasurementSubmissionSource;
  customer: {
    name?: string;
    phone: string;
    address: string;
    apartment?: string;
  };
  itemSummary: string;
  comment?: string;
  preferredTime?: string;
  preliminaryTotalRub?: number;
  payerType: MeasurementPayerType;
  jarvis?: {
    conversationId: string;
    memoryRevision: number;
    quoteId: string;
  };
}

export interface UpcomingMeasurementRecord {
  submission: MeasurementSubmissionV1;
  createdAt: string;
  updatedAt: string;
  sheetSyncStatus: MeasurementSheetSyncStatus;
  sheetSyncUpdatedAt: string;
  sheetSyncErrorCode?: string;
}
