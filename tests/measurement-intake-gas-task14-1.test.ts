import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { beforeEach, describe, expect, it } from 'vitest';

const GAS_SOURCE = readFileSync(
  new URL('../integrations/google-apps-script/measurement-intake.gs', import.meta.url),
  'utf8',
);

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { nullValue: null };

type FirestoreFields = Record<string, FirestoreValue>;

interface FetchOptions {
  method: string;
  payload?: string;
}

interface FetchCall {
  url: string;
  options: FetchOptions;
}

class FakeResponse {
  constructor(
    private readonly status: number,
    private readonly body = '',
  ) {}

  getResponseCode() {
    return this.status;
  }

  getContentText() {
    return this.body;
  }
}

class FakeSheet {
  rows: unknown[][];
  failNextDataWrite = false;
  dataWriteAttempts = 0;

  constructor(headers: unknown[], data: unknown[][] = []) {
    this.rows = [headers.slice(), ...data.map((row) => row.slice())];
  }

  getLastColumn() {
    return Math.max(0, ...this.rows.map((row) => row.length));
  }

  getLastRow() {
    let last = 0;
    for (let index = 0; index < this.rows.length; index += 1) {
      if (this.rows[index]?.some((value) => String(value ?? '') !== '')) last = index + 1;
    }
    return last;
  }

  getRange(row: number, column: number, rowCount = 1, columnCount = 1) {
    return {
      getDisplayValues: () =>
        Array.from({ length: rowCount }, (_, rowOffset) =>
          Array.from({ length: columnCount }, (_, columnOffset) =>
            String(this.rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? ''),
          ),
        ),
      setValue: (value: unknown) => {
        if (row > 1) {
          this.dataWriteAttempts += 1;
          if (this.failNextDataWrite) {
            this.failNextDataWrite = false;
            throw new Error('sheet unavailable');
          }
        }
        while (this.rows.length < row) this.rows.push([]);
        const target = this.rows[row - 1];
        if (!target) throw new Error('missing row');
        while (target.length < column) target.push('');
        target[column - 1] = value;
      },
    };
  }
}

class FirestoreStub {
  readonly calls: FetchCall[] = [];
  readonly documents = new Map<string, FirestoreFields>();
  failGets = false;

  fetch = (url: string, options: FetchOptions) => {
    this.calls.push({ url, options: structuredClone(options) });
    const submissionId = decodeURIComponent(url.split('?')[0]?.split('/').at(-1) ?? '');
    const method = options.method.toLowerCase();
    if (method === 'get') {
      if (this.failGets) return new FakeResponse(503, 'unavailable');
      const fields = this.documents.get(submissionId);
      return fields
        ? new FakeResponse(200, JSON.stringify({ fields }))
        : new FakeResponse(404, 'not found');
    }
    if (method === 'patch') {
      const body = JSON.parse(options.payload ?? '{}') as { fields?: FirestoreFields };
      this.documents.set(submissionId, {
        ...(this.documents.get(submissionId) ?? {}),
        ...(body.fields ?? {}),
      });
      return new FakeResponse(200, '{}');
    }
    return new FakeResponse(405, 'unsupported');
  };
}

interface GasApi {
  doPost(event: { postData: { contents: string } }): { text: string };
}

interface Harness {
  api: GasApi;
  sheet: FakeSheet;
  firestore: FirestoreStub;
  post(payload: Record<string, unknown>): Record<string, unknown>;
}

const LIVE_HEADERS = ['Имя', 'Телефон', 'Адрес', 'Изделия', 'Заказчик', 'сумма'];

function createHarness(
  headers: unknown[] = LIVE_HEADERS,
  data: unknown[][] = [],
  firestore = new FirestoreStub(),
): Harness {
  const sheet = new FakeSheet(headers, data);
  const context = vm.createContext({
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    String,
    Error,
    Boolean,
    isFinite,
    encodeURIComponent,
    LockService: {
      getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => {
          if (key === 'MEASUREMENT_FIREBASE_PROJECT_ID') return 'test-project';
          if (key === 'MEASUREMENT_SHEET_NAME') return 'Замеры';
          return '';
        },
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name: string) => (name === 'Замеры' ? sheet : null),
      }),
      openById: () => ({
        getSheetByName: (name: string) => (name === 'Замеры' ? sheet : null),
      }),
    },
    ScriptApp: { getOAuthToken: () => 'oauth-token' },
    UrlFetchApp: { fetch: firestore.fetch },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text: string) => ({
        text,
        setMimeType() {
          return this;
        },
      }),
    },
  });
  vm.runInContext(GAS_SOURCE, context, { filename: 'measurement-intake.gs' });
  const api = context as unknown as GasApi;
  return {
    api,
    sheet,
    firestore,
    post(payload) {
      const output = api.doPost({ postData: { contents: JSON.stringify(payload) } });
      return JSON.parse(output.text) as Record<string, unknown>;
    },
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    action: 'upsert_measurement',
    submissionId: 'crm_X',
    source: 'PRESALES_CRM',
    name: 'Тест Клиент',
    phone: '89990000000',
    address: 'Тестовый проспект, 1',
    itemSummary: '3 сетки стандарт',
    comment: 'свободный комментарий не для D',
    customerComment: 'Позвонить заранее',
    payer_text: 'Заказчик',
    amount_rub: 1000,
    ...overrides,
  };
}

beforeEach(() => {
  expect(GAS_SOURCE).toContain("ScriptApp.getOAuthToken()");
  expect(GAS_SOURCE).toContain("'MEASUREMENT_FIREBASE_PROJECT_ID'");
});

describe('Task 14.1 live Sheet mapping using the actual GAS source', () => {
  it('LIVE-1/LIVE-2 preserves exact A:F semantics and D uses itemSummary', () => {
    const harness = createHarness();
    const result = harness.post({ ...payload(), action: 'upsert_measurement_sheet' });

    expect(result).toMatchObject({ ok: true, status: 'SUBMITTED', firestore: 'NOT_REQUESTED' });
    expect(harness.sheet.rows[0]?.slice(0, 7)).toEqual([...LIVE_HEADERS, 'submission_id']);
    expect(harness.sheet.rows[1]?.slice(0, 7)).toEqual([
      'Тест Клиент',
      '89990000000',
      'Тестовый проспект, 1',
      '3 сетки стандарт',
      'Заказчик',
      1000,
      'crm_X',
    ]);
    expect(harness.firestore.calls).toHaveLength(0);
  });

  it('LIVE-3 supports positional A:F fallback only when all six headers are blank', () => {
    const harness = createHarness(['', '', '', '', '', '']);
    expect(harness.post({ ...payload(), action: 'upsert_measurement_sheet' }).ok).toBe(true);
    expect(harness.sheet.rows[1]?.slice(0, 6)).toEqual([
      'Тест Клиент',
      '89990000000',
      'Тестовый проспект, 1',
      '3 сетки стандарт',
      'Заказчик',
      1000,
    ]);
  });

  it('LIVE-4 fails closed for ambiguous, reordered, or partial visible headers', () => {
    for (const headers of [
      ['Имя', 'Телефон', 'Адрес', 'Комментарий', 'Заказчик', 'сумма'],
      ['Телефон', 'Имя', 'Адрес', 'Изделия', 'Заказчик', 'сумма'],
      ['Имя', 'Телефон', '', 'Изделия', 'Заказчик', 'сумма'],
    ]) {
      const result = createHarness(headers).post({
        ...payload(),
        action: 'upsert_measurement_sheet',
      });
      expect(result).toMatchObject({ ok: false, error: { code: 'SHEET_SCHEMA_MISMATCH' } });
    }
  });

  it('requires itemSummary and never falls back to a free comment for column D', () => {
    const harness = createHarness();
    const request = payload({ itemSummary: undefined, comment: 'не список изделий' });
    const result = harness.post({ ...request, action: 'upsert_measurement_sheet' });

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(harness.sheet.dataWriteAttempts).toBe(0);
  });

  it('accepts the required payer aliases without changing A:F', () => {
    for (const payerHeader of ['Заказчик', 'Платит', 'Плательщик']) {
      const harness = createHarness([...LIVE_HEADERS.slice(0, 4), payerHeader, 'Сумма']);
      expect(harness.post({ ...payload(), action: 'upsert_measurement_sheet' }).ok).toBe(true);
      expect(harness.sheet.rows[0]?.slice(0, 6)).toEqual([
        'Имя',
        'Телефон',
        'Адрес',
        'Изделия',
        payerHeader,
        'Сумма',
      ]);
    }
  });

  it('LIVE-5 appends submission_id to the right of existing columns', () => {
    const harness = createHarness([...LIVE_HEADERS, 'служебная']);
    harness.post({ ...payload(), action: 'upsert_measurement_sheet' });
    expect(harness.sheet.rows[0]?.slice(0, 8)).toEqual([
      ...LIVE_HEADERS,
      'служебная',
      'submission_id',
    ]);
  });

  it('LIVE-6 updates the same submission_id row rather than appending', () => {
    const harness = createHarness([...LIVE_HEADERS, 'submission_id'], [
      ['Старое имя', '1', 'Старый адрес', '1 сетка', 'фирма', 10, 'crm_X'],
    ]);
    const result = harness.post({
      ...payload({ name: 'Новое имя', itemSummary: '4 сетки стандарт' }),
      action: 'upsert_measurement_sheet',
    });

    expect(result).toMatchObject({ created: false, updated: true, row: 2 });
    expect(harness.sheet.rows).toHaveLength(2);
    expect(harness.sheet.rows[1]?.[0]).toBe('Новое имя');
    expect(harness.sheet.rows[1]?.[3]).toBe('4 сетки стандарт');
  });
});

describe('Task 14.1 Firestore REST sequencing and failure control', () => {
  it('creates the full CRM projection before Sheet and marks it sent', () => {
    const harness = createHarness();
    const result = harness.post(payload({ apt: '12', time: 'вечером' }));
    const fields = harness.firestore.documents.get('crm_X');

    expect(result).toMatchObject({
      ok: true,
      status: 'SUBMITTED',
      firestore: 'UPSERTED',
      sheet: 'SENT',
      firestoreCreated: true,
    });
    expect(fields).toMatchObject({
      submissionId: { stringValue: 'crm_X' },
      source: { stringValue: 'PRESALES_CRM' },
      name: { stringValue: 'Тест Клиент' },
      phone: { stringValue: '89990000000' },
      address: { stringValue: 'Тестовый проспект, 1' },
      comment: { stringValue: '3 сетки стандарт' },
      payer_text: { stringValue: 'Заказчик' },
      amount_rub: { integerValue: '1000' },
      apt: { stringValue: '12' },
      time: { stringValue: 'вечером' },
      customerComment: { stringValue: 'Позвонить заранее' },
      sheetSyncStatus: { stringValue: 'sent' },
      sheetSyncErrorCode: { nullValue: null },
    });
    expect(fields).toHaveProperty('createdAt');
    expect(fields).toHaveProperty('updatedAt');
    expect(harness.firestore.calls[0]?.options.method).toBe('get');
    expect(harness.firestore.calls[1]?.options.method).toBe('patch');
    expect(harness.firestore.calls[2]?.options.method).toBe('patch');
  });

  it('uses updateMask and preserves createdAt plus measurer-owned fields on update', () => {
    const firestore = new FirestoreStub();
    firestore.documents.set('crm_X', {
      createdAt: { timestampValue: '2026-01-01T00:00:00.000Z' },
      reservationStatus: { stringValue: 'reserved' },
      reservedByMeasurerId: { stringValue: 'measurer-1' },
      coordinates: { stringValue: 'preserved-by-merge' },
    });
    const harness = createHarness(LIVE_HEADERS, [], firestore);
    harness.post(payload());

    const fields = firestore.documents.get('crm_X');
    expect(fields?.createdAt).toEqual({ timestampValue: '2026-01-01T00:00:00.000Z' });
    expect(fields?.reservationStatus).toEqual({ stringValue: 'reserved' });
    expect(fields?.reservedByMeasurerId).toEqual({ stringValue: 'measurer-1' });
    const intakePatch = firestore.calls.find(
      (call) => call.options.method === 'patch' && call.url.includes('submissionId'),
    );
    expect(intakePatch?.url).toContain('updateMask.fieldPaths=comment');
    expect(intakePatch?.url).not.toContain('updateMask.fieldPaths=createdAt');
    expect(intakePatch?.url).not.toContain('reservationStatus');
  });

  it('returns FAILED and never touches Sheet when Firestore fails', () => {
    const firestore = new FirestoreStub();
    firestore.failGets = true;
    const harness = createHarness(LIVE_HEADERS, [], firestore);
    const result = harness.post(payload());

    expect(result).toMatchObject({
      ok: false,
      status: 'FAILED',
      firestore: 'ERROR',
      sheet: 'NOT_ATTEMPTED',
      error: { code: 'FIRESTORE_UPSERT_FAILED' },
    });
    expect(harness.sheet.dataWriteAttempts).toBe(0);
  });

  it('returns PARTIAL, marks error, then retries idempotently to sent', () => {
    const harness = createHarness();
    harness.sheet.failNextDataWrite = true;
    const partial = harness.post(payload());

    expect(partial).toMatchObject({
      ok: false,
      status: 'PARTIAL',
      firestore: 'UPSERTED',
      sheet: 'ERROR',
    });
    expect(harness.firestore.documents.get('crm_X')?.sheetSyncStatus).toEqual({
      stringValue: 'error',
    });

    const retry = harness.post(payload());
    expect(retry).toMatchObject({ ok: true, status: 'SUBMITTED', sheet: 'SENT' });
    expect(harness.sheet.rows).toHaveLength(2);
    expect(harness.firestore.documents).toHaveProperty('size', 1);
    expect(harness.firestore.documents.get('crm_X')?.sheetSyncStatus).toEqual({
      stringValue: 'sent',
    });
    expect(harness.firestore.documents.get('crm_X')?.createdAt).toBeDefined();
  });
});
