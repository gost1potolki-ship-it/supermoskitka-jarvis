import {
  buildMeasurementFinancials,
  formatMeasurerPayerText,
} from './measurement-financials';
export type MeasurementPayerType = 'CUSTOMER' | 'COMPANY';
export type MeasurementSheetStatus = 'pending' | 'sent' | 'error';

export interface MeasurementSubmissionV1 {
  submissionId: string;
  source: 'PRESALES_CRM';
  customer: {
    name?: string;
    phone: string;
    address: string;
    apartment?: string;
  };
  comment?: string;
  preferredTime?: string;
  preliminaryTotalRub: number;
  measurerPayoutRub: number;
  measurerPayer: MeasurementPayerType;
  customerDepositRub: number;
  remainingBalanceRub: number;
  itemSummary: string;
}

export interface MeasurementSubmissionInput {
  submissionId: string;
  name?: string;
  phone: string;
  address: string;
  apartment?: string;
  comment?: string;
  preferredTime?: string;
  preliminaryTotalRub: number;
  payerType: MeasurementPayerType;
  items: readonly MeasurementSummaryItem[];
}

export interface MeasurementSummaryItem {
  type?: unknown;
  quantity?: unknown;
  details?: unknown;
  color?: unknown;
  mesh?: unknown;
}

export interface MeasurementIntakeGateway {
  upsert(submission: MeasurementSubmissionV1): Promise<MeasurementSubmissionResult>;
}

export type MeasurementSubmissionResult =
  | { status: 'SUBMITTED'; submissionId: string; firestore: 'UPSERTED'; sheet: 'SENT' }
  | {
      status: 'PARTIAL';
      submissionId: string;
      firestore: 'UPSERTED';
      sheet: 'ERROR';
      errorCode: string;
    };

export type MeasurementSubmissionErrorCode =
  | 'MEASUREMENT_VALIDATION_PHONE'
  | 'MEASUREMENT_VALIDATION_ADDRESS'
  | 'MEASUREMENT_VALIDATION_CART'
  | 'MEASUREMENT_VALIDATION_TOTAL'
  | 'MEASUREMENT_PERSISTENCE_FAILED'
  | 'MEASUREMENT_SHEET_NOT_CONFIGURED'
  | 'MEASUREMENT_SHEET_FAILED';

export class MeasurementSubmissionError extends Error {
  public readonly cause?: unknown;

  constructor(
    public readonly code: MeasurementSubmissionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'MeasurementSubmissionError';
    this.cause = options?.cause;
  }
}

const cleanOptional = (value: unknown): string | undefined => {
  const cleaned = String(value ?? '').trim();
  return cleaned || undefined;
};

const normalizePhone = (value: string): string => {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) return `+7${digits}`;
  return raw;
};

export const validateMeasurementInput = (input: MeasurementSubmissionInput): void => {
  const phoneDigits = input.phone.replace(/\D/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    throw new MeasurementSubmissionError(
      'MEASUREMENT_VALIDATION_PHONE',
      'Укажите корректный телефон клиента.',
    );
  }
  if (!input.address.trim()) {
    throw new MeasurementSubmissionError(
      'MEASUREMENT_VALIDATION_ADDRESS',
      'Укажите адрес объекта.',
    );
  }
  if (!input.items.length) {
    throw new MeasurementSubmissionError(
      'MEASUREMENT_VALIDATION_CART',
      'Добавьте хотя бы одну позицию в корзину.',
    );
  }
  if (!Number.isFinite(input.preliminaryTotalRub) || input.preliminaryTotalRub <= 0) {
    throw new MeasurementSubmissionError(
      'MEASUREMENT_VALIDATION_TOTAL',
      'Не удалось определить корректную предварительную сумму.',
    );
  }
};

export const buildCompactItemSummary = (items: readonly MeasurementSummaryItem[]): string =>
  items
    .map((item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const type = cleanOptional(item.type) ?? 'Позиция';
      const details = cleanOptional(item.details);
      return `${quantity} × ${type}${details ? ` — ${details}` : ''}`;
    })
    .join('; ');

export const buildMeasurementSubmission = (
  input: MeasurementSubmissionInput,
): MeasurementSubmissionV1 => {
  validateMeasurementInput(input);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(input.submissionId)) {
    throw new MeasurementSubmissionError(
      'MEASUREMENT_PERSISTENCE_FAILED',
      'Некорректный идентификатор заявки.',
    );
  }
  const financials = buildMeasurementFinancials({
    preliminaryTotalRub: input.preliminaryTotalRub,
    measurerPayer: input.payerType,
  });
  return {
    submissionId: input.submissionId,
    source: 'PRESALES_CRM',
    customer: {
      ...(cleanOptional(input.name) ? { name: cleanOptional(input.name) } : {}),
      phone: normalizePhone(input.phone),
      address: input.address.trim(),
      ...(cleanOptional(input.apartment) ? { apartment: cleanOptional(input.apartment) } : {}),
    },
    ...(cleanOptional(input.comment) ? { comment: cleanOptional(input.comment) } : {}),
    ...(cleanOptional(input.preferredTime) ? { preferredTime: cleanOptional(input.preferredTime) } : {}),
    preliminaryTotalRub: financials.preliminaryTotalRub,
    measurerPayoutRub: financials.measurerPayoutRub,
    measurerPayer: financials.measurerPayer,
    customerDepositRub: financials.customerDepositRub,
    remainingBalanceRub: financials.remainingBalanceRub,
    itemSummary: buildCompactItemSummary(input.items),
  };
};

export const buildMeasurementSheetPayload = (
  submission: MeasurementSubmissionV1,
): Record<string, unknown> => ({
  action: 'upsert_measurement',
  submissionId: submission.submissionId,
  address: submission.customer.address,
  name: submission.customer.name ?? '',
  phone: submission.customer.phone,
  itemSummary: submission.itemSummary,
  customerComment: submission.comment ?? '',
  amount_rub: submission.measurerPayoutRub,
  payer_text: formatMeasurerPayerText(submission.measurerPayer),
  preliminaryTotalRub: submission.preliminaryTotalRub,
  measurerPayoutRub: submission.measurerPayoutRub,
  measurerPayer: submission.measurerPayer,
  customerDepositRub: submission.customerDepositRub,
  remainingBalanceRub: submission.remainingBalanceRub,
  apt: submission.customer.apartment ?? '',
  time: submission.preferredTime ?? '',
  source: submission.source,
});

export const measurementFingerprint = (submission: MeasurementSubmissionV1): string => {
  const canonical = JSON.stringify({
    phone: submission.customer.phone,
    address: submission.customer.address,
    apartment: submission.customer.apartment ?? '',
    name: submission.customer.name ?? '',
    comment: submission.comment ?? '',
    preferredTime: submission.preferredTime ?? '',
    preliminaryTotalRub: submission.preliminaryTotalRub,
    measurerPayer: submission.measurerPayer,
    measurerPayoutRub: submission.measurerPayoutRub,
    customerDepositRub: submission.customerDepositRub,
    remainingBalanceRub: submission.remainingBalanceRub,
    itemSummary: submission.itemSummary,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `crm-measure-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const createMeasurementSubmissionId = (): string => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `crm_${uuid}`;
  return `crm_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

export const submitMeasurement = async (
  input: MeasurementSubmissionInput,
  gateway: MeasurementIntakeGateway,
): Promise<MeasurementSubmissionResult> => {
  const submission = buildMeasurementSubmission(input);
  return gateway.upsert(submission);
};

type MeasurementWebhookResponse = {
  ok?: boolean;
  status?: string;
  submissionId?: string;
  firestore?: string;
  sheet?: string;
  error?: { code?: string; message?: string };
};

export const getMeasurementSheetWebhookUrl = (): string => {
  const url = String(import.meta.env.VITE_MEASUREMENT_SHEET_WEBHOOK_URL ?? '').trim();
  if (!url) {
    throw new MeasurementSubmissionError(
      'MEASUREMENT_SHEET_NOT_CONFIGURED',
      'Webhook таблицы замеров не настроен.',
    );
  }
  return url;
};

const persistenceFailure = (cause?: unknown): MeasurementSubmissionError =>
  new MeasurementSubmissionError(
    'MEASUREMENT_PERSISTENCE_FAILED',
    'Не удалось создать заявку для замерщика. Повторите попытку.',
    { cause },
  );

export const createMeasurementIntakeGateway = (
  fetchImpl: typeof fetch = fetch,
): MeasurementIntakeGateway => ({
  async upsert(submission) {
    try {
      const response = await fetchImpl(getMeasurementSheetWebhookUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(buildMeasurementSheetPayload(submission)),
      });
      const parsed = JSON.parse(await response.text()) as MeasurementWebhookResponse;
      if (!response.ok || parsed.submissionId !== submission.submissionId) {
        throw persistenceFailure();
      }
      if (
        parsed.status === 'SUBMITTED' &&
        parsed.firestore === 'UPSERTED' &&
        parsed.sheet === 'SENT'
      ) {
        return {
          status: 'SUBMITTED',
          submissionId: submission.submissionId,
          firestore: 'UPSERTED',
          sheet: 'SENT',
        };
      }
      if (
        parsed.status === 'PARTIAL' &&
        parsed.firestore === 'UPSERTED' &&
        parsed.sheet === 'ERROR'
      ) {
        return {
          status: 'PARTIAL',
          submissionId: submission.submissionId,
          firestore: 'UPSERTED',
          sheet: 'ERROR',
          errorCode: parsed.error?.code || 'MEASUREMENT_SHEET_FAILED',
        };
      }
      throw persistenceFailure();
    } catch (cause) {
      if (
        cause instanceof MeasurementSubmissionError &&
        cause.code === 'MEASUREMENT_PERSISTENCE_FAILED'
      ) {
        throw cause;
      }
      throw persistenceFailure(cause);
    }
  },
});
