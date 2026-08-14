import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { beforeEach, describe, expect, it } from 'vitest';

interface MeasurementRow {
  name: string;
  phone: string;
  address: string;
  comment: string;
  payer_text: string;
  amount_rub: number;
  submission_id?: string;
  source_hash?: string;
  source_key?: string;
  docId?: string;
}

interface FirestoreDocument {
  docId: string;
  docName: string;
  source_hash: string;
}

interface FirestoreWrite {
  delete?: string;
  update?: {
    name: string;
    fields: Record<string, unknown>;
  };
  updateMask?: {
    fieldPaths: string[];
  };
}

interface SyncPlan {
  validRows: MeasurementRow[];
  writes: FirestoreWrite[];
  deletedDocIds: string[];
}

interface LegacySync {
  SpreadsheetApp: unknown;
  buildMeasurementDocId_(phone: string, address: string): string;
  buildMeasurementSourceHash_(row: MeasurementRow): string;
  buildTableDocMap_(rows: MeasurementRow[], duplicateCount: number): Record<string, MeasurementRow>;
  buildMeasurementWrite_(docId: string, row: MeasurementRow): FirestoreWrite;
  readMeasurementsSheetWithStats_: () => {
    rows: MeasurementRow[];
    duplicateCount: number;
    skippedNoAddress: number;
  };
  listMeasurementDocuments_: () => FirestoreDocument[];
  planSyncMeasurements_(): SyncPlan;
}

const source = readFileSync(
  new URL('../apps/measurer/scripts/google-apps-script/firebase-crm.js', import.meta.url),
  'utf8',
);

function loadLegacySync(): LegacySync {
  const sandbox = {
    Utilities: {
      Charset: { UTF_8: 'UTF_8' },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_algorithm: string, input: string) => [
        ...createHash('sha256').update(input, 'utf8').digest(),
      ],
    },
  };
  vm.runInContext(source, vm.createContext(sandbox), {
    filename: 'firebase-crm.js',
  });
  return sandbox as unknown as LegacySync;
}

function row(submissionId = ''): MeasurementRow {
  return {
    name: 'Тест Клиент',
    phone: '89990000000',
    address: 'Тестовый проспект, 1',
    comment: '3 сетки стандарт',
    payer_text: 'Заказчик',
    amount_rub: 1000,
    submission_id: submissionId,
  };
}

describe('Task 14.1 legacy Sheet to Firestore coexistence', () => {
  let sync: LegacySync;

  beforeEach(() => {
    sync = loadLegacySync();
  });

  it('keeps live A:F mapping and reads appended submission_id', () => {
    const sheetValues = [
      'Тест Клиент',
      '89990000000',
      'Тестовый проспект, 1',
      '3 сетки стандарт',
      'Заказчик',
      1000,
      'CRM',
      'crm_X',
    ];
    const sheet = {
      getLastColumn: () => 8,
      getLastRow: () => 2,
      getRange: (startRow: number) => ({
        getValues: () =>
          startRow === 1 ? [['source', 'submission_id']] : [sheetValues],
      }),
    };
    sync.SpreadsheetApp = {
      getActiveSpreadsheet: () => ({
        getSheetByName: () => sheet,
      }),
    };

    expect(sync.readMeasurementsSheetWithStats_().rows).toEqual([row('crm_X')]);
  });

  it.each(['crm_X', 'jarvis_X'])('uses Task 14 document ID %s without an m_ duplicate', (submissionId) => {
    const map = sync.buildTableDocMap_([row(submissionId)], 0);

    expect(Object.keys(map)).toEqual([submissionId]);
    expect(map[submissionId]?.docId).toBe(submissionId);
  });

  it('preserves the legacy m_<SHA256(phone|address)[0:32]> ID', () => {
    const expectedHash = createHash('sha256')
      .update('+79990000000|тестовый проспект, 1')
      .digest('hex')
      .slice(0, 32);
    const map = sync.buildTableDocMap_([row()], 0);

    expect(Object.keys(map)).toEqual([`m_${expectedHash}`]);
  });

  it('includes submission_id in source_hash', () => {
    expect(sync.buildMeasurementSourceHash_(row('crm_X'))).not.toBe(
      sync.buildMeasurementSourceHash_(row('jarvis_X')),
    );
  });

  it('updates crm_X, removes only stale legacy m_ docs, and preserves nonlegacy docs', () => {
    const legacyDocId = sync.buildMeasurementDocId_(row().phone, row().address);
    sync.readMeasurementsSheetWithStats_ = () => ({
      rows: [row('crm_X')],
      duplicateCount: 0,
      skippedNoAddress: 0,
    });
    sync.listMeasurementDocuments_ = () => [
      {
        docId: 'crm_X',
        docName: 'documents/upcoming_measurements/crm_X',
        source_hash: 'stale',
      },
      {
        docId: legacyDocId,
        docName: `documents/upcoming_measurements/${legacyDocId}`,
        source_hash: 'stale',
      },
      {
        docId: 'jarvis_absent',
        docName: 'documents/upcoming_measurements/jarvis_absent',
        source_hash: 'stale',
      },
      {
        docId: 'task14_other',
        docName: 'documents/upcoming_measurements/task14_other',
        source_hash: 'stale',
      },
    ];

    const plan = sync.planSyncMeasurements_();
    const updatedIds = plan.writes
      .map((write) => write.update?.name.split('/').at(-1))
      .filter(Boolean);

    expect(updatedIds).toEqual(['crm_X']);
    expect(plan.deletedDocIds).toEqual([legacyDocId]);
    expect(plan.writes.filter((write) => write.delete).map((write) => write.delete)).toEqual([
      `documents/upcoming_measurements/${legacyDocId}`,
    ]);
  });

  it('uses updateMask so measurer and Task 14 metadata survives', () => {
    const mappedRow = row('crm_X');
    mappedRow.source_key = '+79990000000|тестовый проспект, 1';
    mappedRow.source_hash = 'hash';

    const write = sync.buildMeasurementWrite_('crm_X', mappedRow);

    expect(write.updateMask?.fieldPaths).toEqual([
      'name',
      'phone',
      'address',
      'comment',
      'payer_text',
      'amount_rub',
      'source_hash',
      'source_key',
      'updated_at',
    ]);
    const preservedFields = [
      'reservation',
      'status',
      'coordinates',
      'completed',
      'submissionId',
      'source',
      'createdAt',
      'sheetSyncStatus',
    ];
    expect(write.updateMask?.fieldPaths.filter((field) => preservedFields.includes(field))).toEqual([]);
  });
});
