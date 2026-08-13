import { PersistenceDataError } from '../src/domain/index.js';
import {
  buildOrderMemoryDocument,
  decodeOrderMemoryDocument,
} from '../src/infrastructure/firestore/index.js';
import { addOrderItem, applyOrderItemFact, createOrderMemory } from '../src/jarvis/memory/index.js';
import { describe, expect, it } from 'vitest';

const SOURCE = {
  sourceMessageId: 'msg-1',
  sourceChannel: 'telegram' as const,
  sourceTimestamp: '2026-08-13T10:00:00.000Z',
};

describe('OrderChange codec hardening', () => {
  it('CHANGE-CODEC-1 valid WHITE → GRAY_7016 round-trip', () => {
    let memory = createOrderMemory({
      orderId: 'chg-1',
      conversationId: 'chg-1',
      now: SOURCE.sourceTimestamp,
    });
    memory = addOrderItem(memory, 'item-1', SOURCE.sourceTimestamp);
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'profileColor',
      value: 'WHITE',
      source: SOURCE,
    }).memory;
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'profileColor',
      value: 'GRAY_7016',
      source: { ...SOURCE, sourceMessageId: 'msg-2' },
    }).memory;

    const decoded = decodeOrderMemoryDocument(buildOrderMemoryDocument(memory, 1)).memory;
    expect(decoded.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'profileColor',
          oldValue: 'WHITE',
          newValue: 'GRAY_7016',
        }),
      ]),
    );
  });

  it('CHANGE-CODEC-2 profileColor MAGIC_BLUE → PersistenceDataError', () => {
    let memory = createOrderMemory({
      orderId: 'chg-2',
      conversationId: 'chg-2',
      now: SOURCE.sourceTimestamp,
    });
    memory = addOrderItem(memory, 'item-1', SOURCE.sourceTimestamp);
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'profileColor',
      value: 'WHITE',
      source: SOURCE,
    }).memory;
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'profileColor',
      value: 'GRAY_7016',
      source: { ...SOURCE, sourceMessageId: 'msg-2' },
    }).memory;

    const doc = buildOrderMemoryDocument(memory, 1) as {
      memory: { changes: Array<Record<string, unknown>> };
    };
    doc.memory.changes[0]!.newValue = 'MAGIC_BLUE';
    expect(() => decodeOrderMemoryDocument(doc)).toThrow(PersistenceDataError);
  });

  it('CHANGE-CODEC-3 numeric field with string value → PersistenceDataError', () => {
    let memory = createOrderMemory({
      orderId: 'chg-3',
      conversationId: 'chg-3',
      now: SOURCE.sourceTimestamp,
    });
    memory = addOrderItem(memory, 'item-1', SOURCE.sourceTimestamp);
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'widthMm',
      value: 1000,
      source: SOURCE,
    }).memory;
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'widthMm',
      value: 1200,
      source: { ...SOURCE, sourceMessageId: 'msg-2' },
    }).memory;

    const doc = buildOrderMemoryDocument(memory, 1) as {
      memory: { changes: Array<Record<string, unknown>> };
    };
    doc.memory.changes[0]!.newValue = '1200';
    expect(() => decodeOrderMemoryDocument(doc)).toThrow(PersistenceDataError);
  });
});
