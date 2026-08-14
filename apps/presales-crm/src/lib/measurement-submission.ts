import {
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

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
  payerType: MeasurementPayerType;
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

export interface UpcomingMeasurementDocument {
  submissionId: string;
  source: 'PRESALES_CRM';
  address: string;
  name?: string;
  phone: string;
  comment?: string;
  amount_rub: number;
  payer_text: 'Клиент' | 'Фирма';
  apt?: string;
  time?: string;
  itemSummary: string;
  createdAt: unknown;
  updatedAt: unknown;
  sheetSyncStatus: MeasurementSheetStatus;
  sheetSyncUpdatedAt: unknown;
  sheetSyncErrorCode?: string;
}

export interface MeasurementStore {
  upsertPending(submission: MeasurementSubmissionV1): Promise<void>;
  updateSheetStatus(
    submissionId: string,
    status: Exclude<MeasurementSheetStatus, 'pending'>,
    errorCode?: string,
  ): Promise<void>;
}

export interface MeasurementSheetGateway {
  upsert(submission: MeasurementSubmissionV1): Promise<void>;
}

export interface MeasurementSubmissionAdapters {
  store: MeasurementStore;
  sheet: MeasurementSheetGateway;
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
    preliminaryTotalRub: input.preliminaryTotalRub,
    payerType: input.payerType,
    itemSummary: buildCompactItemSummary(input.items),
  };
};

const commentWithSummary = (submission: MeasurementSubmissionV1): string => {
  const summary = submission.itemSummary
    ? `${submission.itemSummary}. Предварительный расчёт ${submission.preliminaryTotalRub.toLocaleString('ru-RU')} ₽.`
    : '';
  return [submission.comment, summary].filter(Boolean).join('\n');
};

export const toUpcomingMeasurementDocument = (
  submission: MeasurementSubmissionV1,
  status: MeasurementSheetStatus,
  timestamps: { createdAt: unknown; updatedAt: unknown },
  errorCode?: string,
): UpcomingMeasurementDocument => stripUndefined({
  submissionId: submission.submissionId,
  source: submission.source,
  address: submission.customer.address,
  name: submission.customer.name,
  phone: submission.customer.phone,
  comment: commentWithSummary(submission) || undefined,
  amount_rub: submission.preliminaryTotalRub,
  payer_text: submission.payerType === 'COMPANY' ? 'Фирма' : 'Клиент',
  apt: submission.customer.apartment,
  time: submission.preferredTime,
  itemSummary: submission.itemSummary,
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
  sheetSyncStatus: status,
  sheetSyncUpdatedAt: timestamps.updatedAt,
  sheetSyncErrorCode: errorCode,
}) as UpcomingMeasurementDocument;

export const buildMeasurementSheetPayload = (
  submission: MeasurementSubmissionV1,
): Record<string, unknown> => ({
  action: 'upsert_measurement',
  submissionId: submission.submissionId,
  address: submission.customer.address,
  name: submission.customer.name ?? '',
  phone: submission.customer.phone,
  comment: commentWithSummary(submission),
  amount_rub: submission.preliminaryTotalRub,
  payer_text: submission.payerType === 'COMPANY' ? 'Фирма' : 'Клиент',
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
    payerType: submission.payerType,
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
  adapters: MeasurementSubmissionAdapters,
): Promise<MeasurementSubmissionResult> => {
  const submission = buildMeasurementSubmission(input);
  try {
    await adapters.store.upsertPending(submission);
  } catch (cause) {
    throw new MeasurementSubmissionError(
      'MEASUREMENT_PERSISTENCE_FAILED',
      'Не удалось создать заявку для замерщика. Повторите попытку.',
      { cause },
    );
  }

  try {
    await adapters.sheet.upsert(submission);
    await adapters.store.updateSheetStatus(submission.submissionId, 'sent');
    return {
      status: 'SUBMITTED',
      submissionId: submission.submissionId,
      firestore: 'UPSERTED',
      sheet: 'SENT',
    };
  } catch (cause) {
    const code =
      cause instanceof MeasurementSubmissionError ? cause.code : 'MEASUREMENT_SHEET_FAILED';
    try {
      await adapters.store.updateSheetStatus(submission.submissionId, 'error', code);
    } catch {
      // The operational document already exists. Preserve the original sheet failure for safe retry.
    }
    return {
      status: 'PARTIAL',
      submissionId: submission.submissionId,
      firestore: 'UPSERTED',
      sheet: 'ERROR',
      errorCode: code,
    };
  }
};

const stripUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;

export const createFirestoreMeasurementStore = (firestore: Firestore): MeasurementStore => ({
  async upsertPending(submission) {
    const ref = doc(firestore, 'upcoming_measurements', submission.submissionId);
    const existing = await getDoc(ref);
    const now = serverTimestamp();
    const payload = toUpcomingMeasurementDocument(
      submission,
      'pending',
      { createdAt: existing.exists() ? existing.data().createdAt ?? now : now, updatedAt: now },
    );
    await setDoc(ref, { ...payload, sheetSyncErrorCode: deleteField() }, { merge: true });
  },
  async updateSheetStatus(submissionId, status, errorCode) {
    const now = serverTimestamp();
    await setDoc(
      doc(firestore, 'upcoming_measurements', submissionId),
      stripUndefined({
        sheetSyncStatus: status,
        sheetSyncUpdatedAt: now,
        updatedAt: now,
        sheetSyncErrorCode: errorCode ?? deleteField(),
      }),
      { merge: true },
    );
  },
});

type MeasurementWebhookResponse = {
  ok?: boolean;
  submissionId?: string;
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

export const createMeasurementSheetGateway = (
  fetchImpl: typeof fetch = fetch,
): MeasurementSheetGateway => ({
  async upsert(submission) {
    const response = await fetchImpl(getMeasurementSheetWebhookUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(buildMeasurementSheetPayload(submission)),
    });
    const text = await response.text();
    let parsed: MeasurementWebhookResponse | null = null;
    try {
      parsed = JSON.parse(text) as MeasurementWebhookResponse;
    } catch {
      // Controlled generic error below; never expose the raw body.
    }
    if (
      !response.ok ||
      parsed?.ok !== true ||
      parsed.submissionId !== submission.submissionId
    ) {
      const remoteCode = parsed?.error?.code;
      throw new MeasurementSubmissionError(
        'MEASUREMENT_SHEET_FAILED',
        remoteCode ? `Таблица замеров отклонила запрос (${remoteCode}).` : 'Не удалось синхронизировать таблицу замеров.',
      );
    }
  },
});
