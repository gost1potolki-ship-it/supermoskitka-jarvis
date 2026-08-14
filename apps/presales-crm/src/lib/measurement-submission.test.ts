import { describe, expect, it } from 'vitest';
import { normalizeMeasurement } from './upcoming';
import {
  MeasurementSubmissionError,
  buildMeasurementSubmission,
  measurementFingerprint,
  submitMeasurement,
  toUpcomingMeasurementDocument,
  type MeasurementSheetGateway,
  type MeasurementStore,
  type MeasurementSubmissionInput,
  type MeasurementSubmissionV1,
} from './measurement-submission';

const validInput = (overrides: Partial<MeasurementSubmissionInput> = {}): MeasurementSubmissionInput => ({
  submissionId: 'crm_test-stable-id',
  name: 'Иван',
  phone: '+7 999 123-45-67',
  address: 'ул. Ленина, 1',
  apartment: '12',
  comment: 'Позвонить заранее',
  preferredTime: 'после 18:00',
  preliminaryTotalRub: 8970,
  payerType: 'CUSTOMER',
  items: [{ type: 'Рамочные', quantity: 2, details: 'Антимошка, серый' }],
  ...overrides,
});

const expectCode = (fn: () => unknown, code: string): void => {
  try {
    fn();
    throw new Error('Expected validation error');
  } catch (error) {
    expect(error).toBeInstanceOf(MeasurementSubmissionError);
    expect((error as MeasurementSubmissionError).code).toBe(code);
  }
};

class FakeStore implements MeasurementStore {
  pending: MeasurementSubmissionV1[] = [];
  statuses: Array<{ id: string; status: 'sent' | 'error'; code?: string }> = [];

  async upsertPending(submission: MeasurementSubmissionV1): Promise<void> {
    this.pending.push(submission);
  }

  async updateSheetStatus(
    id: string,
    status: 'sent' | 'error',
    code?: string,
  ): Promise<void> {
    this.statuses.push({ id, status, code });
  }
}

class FakeSheet implements MeasurementSheetGateway {
  ids: string[] = [];

  constructor(private readonly fail = false) {}

  async upsert(submission: MeasurementSubmissionV1): Promise<void> {
    this.ids.push(submission.submissionId);
    if (this.fail) throw new Error('private remote details');
  }
}

describe('Presales CRM measurement submission', () => {
  it('CRM-MEASURE-1 missing phone → validation error', () => {
    expectCode(
      () => buildMeasurementSubmission(validInput({ phone: '' })),
      'MEASUREMENT_VALIDATION_PHONE',
    );
  });

  it('CRM-MEASURE-2 missing address → validation error', () => {
    expectCode(
      () => buildMeasurementSubmission(validInput({ address: ' ' })),
      'MEASUREMENT_VALIDATION_ADDRESS',
    );
  });

  it('CRM-MEASURE-3 empty cart → validation error', () => {
    expectCode(
      () => buildMeasurementSubmission(validInput({ items: [] })),
      'MEASUREMENT_VALIDATION_CART',
    );
  });

  it('CRM-MEASURE-4 valid order → correct Firestore mapping', () => {
    const submission = buildMeasurementSubmission(validInput());
    const document = toUpcomingMeasurementDocument(
      submission,
      'pending',
      { createdAt: 'created', updatedAt: 'updated' },
    );

    expect(document).toMatchObject({
      submissionId: 'crm_test-stable-id',
      source: 'PRESALES_CRM',
      address: 'ул. Ленина, 1',
      name: 'Иван',
      phone: '+79991234567',
      amount_rub: 8970,
      apt: '12',
      time: 'после 18:00',
      sheetSyncStatus: 'pending',
    });
    expect(Object.values(document)).not.toContain(undefined);
  });

  it('CRM-MEASURE-5 payer CUSTOMER → Клиент', () => {
    const document = toUpcomingMeasurementDocument(
      buildMeasurementSubmission(validInput({ payerType: 'CUSTOMER' })),
      'pending',
      { createdAt: 1, updatedAt: 1 },
    );
    expect(document.payer_text).toBe('Клиент');
  });

  it('CRM-MEASURE-6 payer COMPANY → Фирма', () => {
    const document = toUpcomingMeasurementDocument(
      buildMeasurementSubmission(validInput({ payerType: 'COMPANY' })),
      'pending',
      { createdAt: 1, updatedAt: 1 },
    );
    expect(document.payer_text).toBe('Фирма');
  });

  it('CRM-MEASURE-7 same submissionId → same doc id', async () => {
    const store = new FakeStore();
    const sheet = new FakeSheet();
    await submitMeasurement(validInput(), { store, sheet });
    await submitMeasurement(validInput(), { store, sheet });
    expect(store.pending.map((item) => item.submissionId)).toEqual([
      'crm_test-stable-id',
      'crm_test-stable-id',
    ]);
  });

  it('CRM-MEASURE-8 changed fingerprint → update semantics, not new id', () => {
    const first = buildMeasurementSubmission(validInput());
    const changed = buildMeasurementSubmission(validInput({ address: 'Новый адрес, 2' }));
    expect(measurementFingerprint(changed)).not.toBe(measurementFingerprint(first));
    expect(changed.submissionId).toBe(first.submissionId);
  });

  it('CRM-MEASURE-9 sheet error preserves Firestore success status', async () => {
    const store = new FakeStore();
    const result = await submitMeasurement(validInput(), { store, sheet: new FakeSheet(true) });
    expect(result).toMatchObject({ status: 'PARTIAL', firestore: 'UPSERTED', sheet: 'ERROR' });
    expect(store.pending).toHaveLength(1);
    expect(store.statuses[store.statuses.length - 1]).toMatchObject({ status: 'error' });
  });

  it('CRM-MEASURE-10 sheet retry uses same id', async () => {
    const store = new FakeStore();
    const failedSheet = new FakeSheet(true);
    await submitMeasurement(validInput(), { store, sheet: failedSheet });
    const retrySheet = new FakeSheet();
    await submitMeasurement(validInput(), { store, sheet: retrySheet });
    expect([...failedSheet.ids, ...retrySheet.ids]).toEqual([
      'crm_test-stable-id',
      'crm_test-stable-id',
    ]);
    expect(store.statuses[store.statuses.length - 1]).toMatchObject({
      id: 'crm_test-stable-id',
      status: 'sent',
    });
  });

  it('normalizer compatibility reads the new Firestore document', () => {
    const document = toUpcomingMeasurementDocument(
      buildMeasurementSubmission(validInput({ payerType: 'COMPANY' })),
      'sent',
      { createdAt: 1, updatedAt: 2 },
    );
    const normalized = normalizeMeasurement({ id: document.submissionId, data: () => document });
    expect(normalized).toMatchObject({
      id: 'crm_test-stable-id',
      address: 'ул. Ленина, 1',
      apartment: '12',
      customerName: 'Иван',
      phone: '+79991234567',
      price: 8970,
      payerType: 'company',
      time: 'после 18:00',
    });
    expect(normalized.comment).toContain('Позвонить заранее');
    expect(normalized.comment).toContain('Предварительный расчёт');
  });
});
