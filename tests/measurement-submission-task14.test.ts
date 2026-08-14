import request from 'supertest';
import { describe, expect, it } from 'vitest';

import {
  MeasurementSheetError,
  MeasurementSubmissionService,
  createJarvisMeasurementSubmissionId,
  type MeasurementSheetGateway,
  type UpcomingMeasurementStore,
} from '../src/application/index.js';
import type {
  MeasurementSubmissionV1,
  OrderMemory,
  UpcomingMeasurementRecord,
} from '../src/domain/index.js';
import {
  decodeUpcomingMeasurementDocument,
  encodeMeasurementSheetRequest,
  encodeUpcomingMeasurementDocument,
} from '../src/infrastructure/measurement-submission/index.js';
import {
  applyCommercialFact,
  applyCustomerFact,
  applyOrderItemFact,
  createOrderMemory,
} from '../src/jarvis/memory/index.js';

import {
  createTestJarvisHarness,
  TEST_INTERNAL_API_KEY,
} from './helpers/create-test-jarvis-harness.js';
import { persistTestQuote } from './helpers/persist-test-quote.js';

const NOW = '2026-08-14T10:00:00.000Z';
const SOURCE = {
  sourceMessageId: 'task14-message',
  sourceChannel: 'telegram' as const,
  sourceTimestamp: NOW,
};

class FakeUpcomingMeasurementStore implements UpcomingMeasurementStore {
  readonly records = new Map<string, UpcomingMeasurementRecord>();
  pendingCalls = 0;
  sentCalls = 0;
  errorCalls = 0;

  async upsertPending(submission: MeasurementSubmissionV1, now: string): Promise<void> {
    this.pendingCalls += 1;
    const existing = this.records.get(submission.submissionId);
    this.records.set(submission.submissionId, {
      submission: structuredClone(submission),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      sheetSyncStatus: 'pending',
      sheetSyncUpdatedAt: now,
    });
  }

  async markSheetSent(submissionId: string, now: string): Promise<void> {
    this.sentCalls += 1;
    const existing = this.records.get(submissionId);
    if (!existing) throw new Error('missing');
    this.records.set(submissionId, {
      ...existing,
      updatedAt: now,
      sheetSyncStatus: 'sent',
      sheetSyncUpdatedAt: now,
    });
  }

  async markSheetError(submissionId: string, now: string, errorCode: string): Promise<void> {
    this.errorCalls += 1;
    const existing = this.records.get(submissionId);
    if (!existing) throw new Error('missing');
    this.records.set(submissionId, {
      ...existing,
      updatedAt: now,
      sheetSyncStatus: 'error',
      sheetSyncUpdatedAt: now,
      sheetSyncErrorCode: errorCode,
    });
  }

  async get(submissionId: string): Promise<UpcomingMeasurementRecord | null> {
    const record = this.records.get(submissionId);
    return record ? structuredClone(record) : null;
  }
}

class FakeSheetGateway implements MeasurementSheetGateway {
  readonly submissions: MeasurementSubmissionV1[] = [];

  constructor(private readonly outcomes: Array<'success' | 'failure' | 'not-configured'> = ['success']) {}

  async upsertMeasurement(submission: MeasurementSubmissionV1) {
    this.submissions.push(structuredClone(submission));
    const outcome = this.outcomes.shift() ?? 'success';
    if (outcome === 'failure') {
      throw new MeasurementSheetError('REQUEST_FAILED', 'failed');
    }
    if (outcome === 'not-configured') {
      throw new MeasurementSheetError('NOT_CONFIGURED', 'not configured');
    }
    return {
      submissionId: submission.submissionId,
      created: true,
      updated: false,
    };
  }
}

function service(store: FakeUpcomingMeasurementStore, sheet: FakeSheetGateway) {
  return new MeasurementSubmissionService(store, sheet, { now: () => NOW });
}

function submission(overrides: Partial<MeasurementSubmissionV1> = {}): MeasurementSubmissionV1 {
  return {
    submissionId: 'jarvis_test',
    source: 'JARVIS',
    customer: {
      name: 'Иван',
      phone: '+79990001122',
      address: 'Москва, Тверская 1',
      apartment: '12',
    },
    itemSummary: '1 × FRAME',
    comment: 'Свободный комментарий клиента',
    preferredTime: 'после 18:00',
    preliminaryTotalRub: 15_200,
    measurerPayoutRub: 1000,
    measurerPayer: 'CUSTOMER',
    customerDepositRub: 1000,
    remainingBalanceRub: 14_200,
    jarvis: {
      conversationId: 'conversation-test',
      memoryRevision: 3,
      quoteId: 'quote-test',
    },
    ...overrides,
  };
}

async function readyMemory(conversationId: string, total = 15_200): Promise<OrderMemory> {
  let memory = createOrderMemory({
    orderId: conversationId,
    conversationId,
    itemIds: ['item-1'],
    now: NOW,
  });
  for (const [field, value] of [
    ['productType', 'FRAME'],
    ['profileColor', 'WHITE'],
    ['meshType', 'STANDARD'],
    ['widthMm', 1000],
    ['heightMm', 1500],
    ['measurementBasis', 'PRODUCT_SIZE'],
  ] as const) {
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field,
      value,
      source: SOURCE,
    }).memory;
  }
  memory = applyCustomerFact(memory, {
    field: 'phone',
    value: '+79990000000',
    source: SOURCE,
  }).memory;
  memory = applyCustomerFact(memory, {
    field: 'address',
    value: 'Только доверенный адрес',
    source: SOURCE,
  }).memory;
  memory = (await persistTestQuote(memory, total)).memory;
  memory = applyCommercialFact(memory, {
    field: 'preliminaryPriceAccepted',
    value: true,
    source: SOURCE,
  }).memory;
  return applyCommercialFact(memory, {
    field: 'measurementAgreed',
    value: true,
    source: SOURCE,
  }).memory;
}

async function createConversation(harness: ReturnType<typeof createTestJarvisHarness>) {
  const response = await request(harness.app)
    .post('/internal/v1/conversations')
    .set('Authorization', `Bearer ${harness.apiKey}`)
    .send({});
  return response.body.conversationId as string;
}

describe('Task 14 Measurement Submission Service', () => {
  it('JMS-3 submits Firestore pending then Sheet then sent', async () => {
    const store = new FakeUpcomingMeasurementStore();
    const sheet = new FakeSheetGateway();
    const result = await service(store, sheet).submit(submission());
    expect(result).toEqual({
      submissionId: 'jarvis_test',
      status: 'SUBMITTED',
      firestore: 'UPSERTED',
      sheet: 'SENT',
    });
    expect(store.pendingCalls).toBe(1);
    expect(store.sentCalls).toBe(1);
    expect(sheet.submissions).toHaveLength(1);
    expect((await store.get('jarvis_test'))?.sheetSyncStatus).toBe('sent');
  });

  it('JMS-8/9 preserves one Firestore document with error across safe retry', async () => {
    const store = new FakeUpcomingMeasurementStore();
    const sheet = new FakeSheetGateway(['failure', 'failure']);
    const executor = service(store, sheet);
    expect((await executor.submit(submission())).status).toBe('PARTIAL');
    expect((await executor.submit(submission())).status).toBe('PARTIAL');
    expect(store.records.size).toBe(1);
    expect(store.records.get('jarvis_test')?.sheetSyncStatus).toBe('error');
    expect(store.errorCalls).toBe(2);
  });

  it('JMS-10 successful retry changes error status to sent', async () => {
    const store = new FakeUpcomingMeasurementStore();
    const executor = service(store, new FakeSheetGateway(['failure', 'success']));
    await executor.submit(submission());
    const result = await executor.submit(submission());
    expect(result.status).toBe('SUBMITTED');
    expect(store.records.size).toBe(1);
    expect(store.records.get('jarvis_test')?.sheetSyncStatus).toBe('sent');
  });
});

describe('Task 14 trusted Jarvis use case and HTTP', () => {
  it('JMS-1 NOT_READY makes zero operational calls', async () => {
    const store = new FakeUpcomingMeasurementStore();
    const sheet = new FakeSheetGateway();
    const harness = createTestJarvisHarness({
      measurementSubmissionService: service(store, sheet),
    });
    const conversationId = await createConversation(harness);
    const response = await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/measurement-submit`)
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({});
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('MEASUREMENT_NOT_READY');
    expect(store.pendingCalls).toBe(0);
    expect(sheet.submissions).toHaveLength(0);
  });

  it('JMS-2 OWNER_APPROVAL makes zero operational calls', async () => {
    const store = new FakeUpcomingMeasurementStore();
    const sheet = new FakeSheetGateway();
    const harness = createTestJarvisHarness({
      measurementActionPolicy: 'ALWAYS_MANUAL',
      measurementSubmissionService: service(store, sheet),
    });
    const conversationId = await createConversation(harness);
    await harness.orderMemoryStore.save(await readyMemory(conversationId));
    const response = await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/measurement-submit`)
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({});
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('MEASUREMENT_OWNER_APPROVAL_REQUIRED');
    expect(store.pendingCalls).toBe(0);
    expect(sheet.submissions).toHaveLength(0);
  });

  it('JMS-4/5 ignores HTTP overrides and uses trusted draft and quote', async () => {
    const store = new FakeUpcomingMeasurementStore();
    const sheet = new FakeSheetGateway();
    const harness = createTestJarvisHarness({
      measurementSubmissionService: service(store, sheet),
    });
    const conversationId = await createConversation(harness);
    await harness.orderMemoryStore.save(await readyMemory(conversationId, 15_200));
    const response = await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/measurement-submit`)
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({
        phone: 'OVERRIDE',
        address: 'OVERRIDE',
        publicTotalRub: 1,
        quoteId: 'OVERRIDE',
      });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('SUBMITTED');
    expect(sheet.submissions[0]?.customer.phone).toBe('+79990000000');
    expect(sheet.submissions[0]?.customer.address).toBe('Только доверенный адрес');
    expect(sheet.submissions[0]?.preliminaryTotalRub).toBe(15_200);
    expect(sheet.submissions[0]?.measurerPayoutRub).toBe(1000);
    expect(sheet.submissions[0]?.remainingBalanceRub).toBe(14_200);
    expect(sheet.submissions[0]?.jarvis?.quoteId).not.toBe('OVERRIDE');
    expect(sheet.submissions[0]?.itemSummary).toBe('1 × FRAME');
    expect(sheet.submissions[0]?.itemSummary).not.toContain('15 200');
    expect(sheet.submissions[0]).not.toHaveProperty('comment');
  });

  it('JMS-6 changed memory revision is rejected stale before writes', async () => {
    const store = new FakeUpcomingMeasurementStore();
    const sheet = new FakeSheetGateway();
    const harness = createTestJarvisHarness({
      measurementSubmissionService: service(store, sheet),
    });
    const conversationId = await createConversation(harness);
    await harness.orderMemoryStore.save(await readyMemory(conversationId));
    const originalGet = harness.orderMemoryStore.get.bind(harness.orderMemoryStore);
    let reads = 0;
    harness.orderMemoryStore.get = async (id: string) => {
      reads += 1;
      const current = await originalGet(id);
      if (reads === 2 && current) {
        return harness.orderMemoryStore.save({ ...current, updatedAt: `${NOW}-changed` });
      }
      return current;
    };
    const response = await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/measurement-submit`)
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({});
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('MEASUREMENT_SUBMISSION_STALE');
    expect(store.pendingCalls).toBe(0);
    expect(sheet.submissions).toHaveLength(0);
  });

  it('JMS-7 same conversation retry uses deterministic same submissionId', async () => {
    const store = new FakeUpcomingMeasurementStore();
    const sheet = new FakeSheetGateway(['success', 'success']);
    const harness = createTestJarvisHarness({
      measurementSubmissionService: service(store, sheet),
    });
    const conversationId = await createConversation(harness);
    await harness.orderMemoryStore.save(await readyMemory(conversationId));
    const first = await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/measurement-submit`)
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({});
    const second = await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/measurement-submit`)
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({});
    expect(first.body.submissionId).toBe(second.body.submissionId);
    expect(first.body.submissionId).toBe(
      createJarvisMeasurementSubmissionId(conversationId),
    );
    expect(store.records.size).toBe(1);
  });

  it('HTTP route requires the existing bearer auth', async () => {
    const harness = createTestJarvisHarness();
    const noBearer = await request(harness.app).post(
      '/internal/v1/conversations/x/measurement-submit',
    );
    const wrongBearer = await request(harness.app)
      .post('/internal/v1/conversations/x/measurement-submit')
      .set('Authorization', 'Bearer wrong');
    expect(noBearer.status).toBe(401);
    expect(wrongBearer.status).toBe(401);
    expect(noBearer.body.error.code).toBe('UNAUTHORIZED');
  });

  it('Sheet not configured is controlled 503 after Firestore upsert', async () => {
    const store = new FakeUpcomingMeasurementStore();
    const harness = createTestJarvisHarness({
      measurementSubmissionService: service(
        store,
        new FakeSheetGateway(['not-configured']),
      ),
    });
    const conversationId = await createConversation(harness);
    await harness.orderMemoryStore.save(await readyMemory(conversationId));
    const response = await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/measurement-submit`)
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({});
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('MEASUREMENT_SHEET_NOT_CONFIGURED');
    expect(response.body.error.details).toMatchObject({
      status: 'PARTIAL',
      firestore: 'UPSERTED',
      sheet: 'ERROR',
    });
    expect(store.records.size).toBe(1);
  });

  it('Sheet request failure is controlled 502 and remains retryable', async () => {
    const store = new FakeUpcomingMeasurementStore();
    const sheet = new FakeSheetGateway(['failure', 'success']);
    const harness = createTestJarvisHarness({
      measurementSubmissionService: service(store, sheet),
    });
    const conversationId = await createConversation(harness);
    await harness.orderMemoryStore.save(await readyMemory(conversationId));
    const first = await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/measurement-submit`)
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({});
    expect(first.status).toBe(502);
    expect(first.body.error.code).toBe('MEASUREMENT_SHEET_FAILED');
    expect(first.body.error.details.firestore).toBe('UPSERTED');

    const retry = await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/measurement-submit`)
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({});
    expect(retry.status).toBe(200);
    expect(retry.body.submissionId).toBe(first.body.error.details.submissionId);
    expect(store.records.size).toBe(1);
  });

  it('persistence failure is controlled and never calls Sheet', async () => {
    const store = new FakeUpcomingMeasurementStore();
    store.upsertPending = async () => {
      throw new Error('firestore unavailable');
    };
    const sheet = new FakeSheetGateway();
    const harness = createTestJarvisHarness({
      measurementSubmissionService: service(store, sheet),
    });
    const conversationId = await createConversation(harness);
    await harness.orderMemoryStore.save(await readyMemory(conversationId));
    const response = await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/measurement-submit`)
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({});
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('MEASUREMENT_PERSISTENCE_FAILED');
    expect(sheet.submissions).toHaveLength(0);
  });
});

describe('Task 14 codecs and measurer compatibility', () => {
  it('maps all canonical fields and excludes undefined recursively', () => {
    const record: UpcomingMeasurementRecord = {
      submission: submission(),
      createdAt: NOW,
      updatedAt: NOW,
      sheetSyncStatus: 'pending',
      sheetSyncUpdatedAt: NOW,
    };
    const doc = encodeUpcomingMeasurementDocument(record);
    expect(doc).toMatchObject({
      submissionId: 'jarvis_test',
      address: 'Москва, Тверская 1',
      name: 'Иван',
      phone: '+79990001122',
      comment: '1 × FRAME',
      amount_rub: 1000,
      payer_text: 'Заказчик',
      preliminaryTotalRub: 15_200,
      measurerPayoutRub: 1000,
      customerDepositRub: 1000,
      remainingBalanceRub: 14_200,
      apt: '12',
      time: 'после 18:00',
      source: 'JARVIS',
      sheetSyncStatus: 'pending',
    });
    expect(JSON.stringify(doc)).not.toContain('undefined');
    expect(doc.comment).not.toContain('Свободный комментарий клиента');
    const projectedRecord = structuredClone(record);
    delete projectedRecord.submission.comment;
    expect(decodeUpcomingMeasurementDocument(doc)).toEqual(projectedRecord);
  });

  it('optional free comment remains absent and COMPANY maps to measurer payer alias', () => {
    const minimal = submission({
      customer: { phone: '+70000000000', address: 'Адрес' },
      measurerPayer: 'COMPANY',
      itemSummary: '2 × WING',
      comment: undefined,
      preferredTime: undefined,
      preliminaryTotalRub: 15_000,
      measurerPayoutRub: 1000,
      customerDepositRub: 0,
      remainingBalanceRub: 15_000,
      jarvis: undefined,
    });
    const doc = encodeUpcomingMeasurementDocument({
      submission: minimal,
      createdAt: NOW,
      updatedAt: NOW,
      sheetSyncStatus: 'pending',
      sheetSyncUpdatedAt: NOW,
    });
    expect(doc.payer_text).toBe('фирма');
    expect(doc.amount_rub).toBe(1000);
    expect(doc).not.toHaveProperty('name');
    expect(doc.comment).toBe('2 × WING');
    expect(doc).not.toHaveProperty('jarvisQuoteId');
  });

  it('Firestore mapping normalizes through the existing measurer aliases', () => {
    const doc = encodeUpcomingMeasurementDocument({
      submission: submission(),
      createdAt: NOW,
      updatedAt: NOW,
      sheetSyncStatus: 'sent',
      sheetSyncUpdatedAt: NOW,
    });
    const normalized = {
      address: doc.address,
      customerName: doc.name,
      phone: doc.phone,
      comment: doc.comment,
      price: Number(doc.amount_rub) || 0,
      payerType: String(doc.payer_text).toLowerCase().includes('фирма')
        ? 'company'
        : 'customer',
      apartment: doc.apt,
      time: doc.time,
    };
    expect(normalized).toEqual({
      address: 'Москва, Тверская 1',
      customerName: 'Иван',
      phone: '+79990001122',
      comment: '1 × FRAME',
      price: 1000,
      payerType: 'customer',
      apartment: '12',
      time: 'после 18:00',
    });
  });

  it('Sheet request has the same idempotency key and public mapping', () => {
    const payload = encodeMeasurementSheetRequest(submission());
    expect(payload).toMatchObject({
      action: 'upsert_measurement_sheet',
      submissionId: 'jarvis_test',
      name: 'Иван',
      phone: '+79990001122',
      address: 'Москва, Тверская 1',
      itemSummary: '1 × FRAME',
      amount_rub: 1000,
      payer_text: 'Заказчик',
      preliminaryTotalRub: 15_200,
      measurerPayoutRub: 1000,
      customerDepositRub: 1000,
      remainingBalanceRub: 14_200,
      source: 'JARVIS',
    });
    expect(payload).not.toHaveProperty('comment');
  });
});
