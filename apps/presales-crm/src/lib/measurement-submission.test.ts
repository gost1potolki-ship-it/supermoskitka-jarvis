import { afterEach, describe, expect, it, vi } from 'vitest';
import source from './measurement-submission.ts?raw';
import {
  MeasurementSubmissionError,
  buildMeasurementSheetPayload,
  buildMeasurementSubmission,
  createMeasurementIntakeGateway,
  measurementFingerprint,
  submitMeasurement,
  type MeasurementIntakeGateway,
  type MeasurementSubmissionInput,
  type MeasurementSubmissionResult,
  type MeasurementSubmissionV1,
} from './measurement-submission';

const validInput = (
  overrides: Partial<MeasurementSubmissionInput> = {},
): MeasurementSubmissionInput => ({
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

class FakeGateway implements MeasurementIntakeGateway {
  submissions: MeasurementSubmissionV1[] = [];

  constructor(
    private readonly result: MeasurementSubmissionResult = {
      status: 'SUBMITTED',
      submissionId: 'crm_test-stable-id',
      firestore: 'UPSERTED',
      sheet: 'SENT',
    },
  ) {}

  async upsert(submission: MeasurementSubmissionV1): Promise<MeasurementSubmissionResult> {
    this.submissions.push(submission);
    return this.result;
  }
}

const response = (body: unknown, ok = true): Response =>
  ({
    ok,
    text: async () => JSON.stringify(body),
  }) as Response;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Presales CRM measurement submission', () => {
  it('keeps the existing input validation', () => {
    expectCode(
      () => buildMeasurementSubmission(validInput({ phone: '' })),
      'MEASUREMENT_VALIDATION_PHONE',
    );
    expectCode(
      () => buildMeasurementSubmission(validInput({ address: ' ' })),
      'MEASUREMENT_VALIDATION_ADDRESS',
    );
    expectCode(
      () => buildMeasurementSubmission(validInput({ items: [] })),
      'MEASUREMENT_VALIDATION_CART',
    );
    expectCode(
      () => buildMeasurementSubmission(validInput({ preliminaryTotalRub: 0 })),
      'MEASUREMENT_VALIDATION_TOTAL',
    );
  });

  it('normalizes the submission and keeps its stable crm_ identity', () => {
    const submission = buildMeasurementSubmission(validInput());
    expect(submission).toMatchObject({
      submissionId: 'crm_test-stable-id',
      source: 'PRESALES_CRM',
      customer: {
        name: 'Иван',
        phone: '+79991234567',
        address: 'ул. Ленина, 1',
        apartment: '12',
      },
      comment: 'Позвонить заранее',
      itemSummary: '2 × Рамочные — Антимошка, серый',
    });
  });

  it('manual submit has no browser Firestore store and calls one gateway once', async () => {
    const gateway = new FakeGateway();
    const result = await submitMeasurement(validInput(), gateway);

    expect(gateway.submissions).toHaveLength(1);
    expect(result).toEqual({
      status: 'SUBMITTED',
      submissionId: 'crm_test-stable-id',
      firestore: 'UPSERTED',
      sheet: 'SENT',
    });
    expect(source).not.toMatch(/from ['"]firebase\/firestore['"]/);
    expect(source).not.toContain('createFirestoreMeasurementStore');
    expect(source).not.toContain('MeasurementStore');
  });

  it('sends itemSummary separately and never maps free comment to legacy comment', () => {
    const payload = buildMeasurementSheetPayload(buildMeasurementSubmission(validInput()));

    expect(payload).toMatchObject({
      action: 'upsert_measurement',
      submissionId: 'crm_test-stable-id',
      itemSummary: '2 × Рамочные — Антимошка, серый',
      customerComment: 'Позвонить заранее',
      amount_rub: 8970,
      payer_text: 'Клиент',
      source: 'PRESALES_CRM',
    });
    expect(payload).not.toHaveProperty('comment');
    expect(payload).not.toHaveProperty('JARVIS_INTERNAL_API_KEY');
  });

  it('keeps customerComment optional without changing itemSummary', () => {
    const payload = buildMeasurementSheetPayload(
      buildMeasurementSubmission(validInput({ comment: '  ' })),
    );
    expect(payload.itemSummary).toBe('2 × Рамочные — Антимошка, серый');
    expect(payload.customerComment).toBe('');
  });

  it('fingerprint changes with content while submissionId remains stable', () => {
    const first = buildMeasurementSubmission(validInput());
    const changed = buildMeasurementSubmission(validInput({ address: 'Новый адрес, 2' }));
    expect(measurementFingerprint(changed)).not.toBe(measurementFingerprint(first));
    expect(changed.submissionId).toBe(first.submissionId);
  });

  it('parses controlled SUBMITTED response', async () => {
    vi.stubEnv('VITE_MEASUREMENT_SHEET_WEBHOOK_URL', 'https://example.test/intake');
    const fetchImpl = vi.fn(async () =>
      response({
        ok: true,
        status: 'SUBMITTED',
        submissionId: 'crm_test-stable-id',
        firestore: 'UPSERTED',
        sheet: 'SENT',
      }),
    );

    const result = await submitMeasurement(
      validInput(),
      createMeasurementIntakeGateway(fetchImpl as typeof fetch),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('SUBMITTED');
  });

  it('parses controlled PARTIAL response and preserves retry UI semantics', async () => {
    vi.stubEnv('VITE_MEASUREMENT_SHEET_WEBHOOK_URL', 'https://example.test/intake');
    const fetchImpl = vi.fn(async () =>
      response({
        ok: false,
        status: 'PARTIAL',
        submissionId: 'crm_test-stable-id',
        firestore: 'UPSERTED',
        sheet: 'ERROR',
        error: { code: 'SHEET_SCHEMA_MISMATCH' },
      }),
    );

    const result = await submitMeasurement(
      validInput(),
      createMeasurementIntakeGateway(fetchImpl as typeof fetch),
    );

    expect(result).toEqual({
      status: 'PARTIAL',
      submissionId: 'crm_test-stable-id',
      firestore: 'UPSERTED',
      sheet: 'ERROR',
      errorCode: 'SHEET_SCHEMA_MISMATCH',
    });
  });

  it.each([
    {
      ok: false,
      status: 'FAILED',
      submissionId: 'crm_test-stable-id',
      firestore: 'ERROR',
      sheet: 'NOT_ATTEMPTED',
      error: { code: 'FIRESTORE_WRITE_FAILED' },
    },
    {
      ok: false,
      status: 'FAILED',
      submissionId: 'crm_test-stable-id',
      error: { code: 'INTERNAL_ERROR' },
    },
  ])('maps FAILED or no-Firestore response to persistence failure', async (body) => {
    vi.stubEnv('VITE_MEASUREMENT_SHEET_WEBHOOK_URL', 'https://example.test/intake');
    const gateway = createMeasurementIntakeGateway(
      vi.fn(async () => response(body)) as unknown as typeof fetch,
    );

    await expect(submitMeasurement(validInput(), gateway)).rejects.toMatchObject({
      code: 'MEASUREMENT_PERSISTENCE_FAILED',
    });
  });

  it('retry sends the same stable ID and eventually succeeds', async () => {
    vi.stubEnv('VITE_MEASUREMENT_SHEET_WEBHOOK_URL', 'https://example.test/intake');
    const bodies = [
      {
        ok: false,
        status: 'PARTIAL',
        submissionId: 'crm_test-stable-id',
        firestore: 'UPSERTED',
        sheet: 'ERROR',
        error: { code: 'SHEET_WRITE_FAILED' },
      },
      {
        ok: true,
        status: 'SUBMITTED',
        submissionId: 'crm_test-stable-id',
        firestore: 'UPSERTED',
        sheet: 'SENT',
      },
    ];
    const sentIds: string[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sentIds.push(
        (JSON.parse(String(init?.body)) as { submissionId: string }).submissionId,
      );
      return response(bodies.shift());
    });
    const gateway = createMeasurementIntakeGateway(fetchImpl as typeof fetch);

    const first = await submitMeasurement(validInput(), gateway);
    const retry = await submitMeasurement(validInput(), gateway);

    expect(first.status).toBe('PARTIAL');
    expect(retry.status).toBe('SUBMITTED');
    expect(sentIds).toEqual(['crm_test-stable-id', 'crm_test-stable-id']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
