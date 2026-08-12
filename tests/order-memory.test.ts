import { getFactValue } from '../src/domain/index.js';
import {
  addOrderItem,
  applyOrderItemFact,
  createOrderMemory,
} from '../src/jarvis/memory/index.js';
import { describe, expect, it } from 'vitest';

function source(
  messageId: string,
  timestamp: string,
  channel: 'telegram' | 'website' | 'whatsapp' | 'avito' | 'max' | 'email' | 'unknown' = 'telegram',
) {
  return {
    sourceMessageId: messageId,
    sourceChannel: channel,
    sourceTimestamp: timestamp,
  };
}

describe('order memory', () => {
  it('creates empty order memory', () => {
    const memory = createOrderMemory({
      orderId: 'order-1',
      conversationId: 'conv-1',
      now: '2026-07-07T10:00:00.000Z',
    });

    expect(memory.orderId).toBe('order-1');
    expect(memory.conversationId).toBe('conv-1');
    expect(memory.items).toEqual([]);
    expect(memory.changes).toEqual([]);
    expect(memory.createdAt).toBe('2026-07-07T10:00:00.000Z');
  });

  it('supports several items in one order', () => {
    let memory = createOrderMemory({
      orderId: 'order-1',
      conversationId: 'conv-1',
      itemIds: ['item-1'],
    });
    memory = addOrderItem(memory, 'item-2');

    expect(memory.items.map((item) => item.id)).toEqual(['item-1', 'item-2']);
  });

  it('stores fact source metadata', () => {
    let memory = createOrderMemory({
      orderId: 'order-1',
      conversationId: 'conv-1',
      itemIds: ['item-1'],
    });

    const result = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'profileColor',
      value: 'white',
      source: source('msg-1', '2026-07-07T10:00:00.000Z', 'whatsapp'),
    });
    memory = result.memory;

    const fact = memory.items[0]?.profileColor;
    expect(fact?.current).toEqual({
      value: 'white',
      sourceMessageId: 'msg-1',
      sourceChannel: 'whatsapp',
      sourceTimestamp: '2026-07-07T10:00:00.000Z',
    });
    expect(fact?.lastSeenSource).toEqual({
      sourceMessageId: 'msg-1',
      sourceChannel: 'whatsapp',
      sourceTimestamp: '2026-07-07T10:00:00.000Z',
    });
    expect(result.change).toBeNull();
  });

  it('adds a previously unknown value without OrderChange', () => {
    let memory = createOrderMemory({
      orderId: 'order-1',
      conversationId: 'conv-1',
      itemIds: ['item-1'],
    });

    const result = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'widthMm',
      value: 720,
      source: source('msg-1', '2026-07-07T10:00:00.000Z'),
    });
    memory = result.memory;

    expect(getFactValue(memory.items[0]?.widthMm)).toBe(720);
    expect(memory.changes).toEqual([]);
    expect(result.change).toBeNull();
  });

  it('updates lastSeenSource on repeated identical value without OrderChange or history', () => {
    let memory = createOrderMemory({
      orderId: 'order-1',
      conversationId: 'conv-1',
      itemIds: ['item-1'],
    });

    const firstSource = source('msg-1', '2026-07-07T10:00:00.000Z');
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'ral',
      value: '8028',
      source: firstSource,
    }).memory;

    const secondSource = source('msg-2', '2026-07-10T10:00:00.000Z');
    const result = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'ral',
      value: '8028',
      source: secondSource,
    });

    expect(result.change).toBeNull();
    expect(result.memory.changes).toEqual([]);
    expect(result.memory.items[0]?.ral?.history).toEqual([]);
    expect(result.memory.items[0]?.ral?.current).toEqual({
      value: '8028',
      ...firstSource,
    });
    expect(result.memory.items[0]?.ral?.lastSeenSource).toEqual(secondSource);
  });

  it('rejects duplicate itemIds on createOrderMemory', () => {
    expect(() =>
      createOrderMemory({
        orderId: 'order-1',
        conversationId: 'conv-1',
        itemIds: ['item-1', 'item-1'],
      }),
    ).toThrow('Duplicate order item IDs');
  });

  it('changes a value, keeps history, and creates OrderChange', () => {
    let memory = createOrderMemory({
      orderId: 'order-1',
      conversationId: 'conv-1',
      itemIds: ['item-1'],
    });

    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'profileColor',
      value: 'white',
      source: source('msg-1', '2026-07-07T10:00:00.000Z'),
    }).memory;

    const result = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'profileColor',
      value: 'brown',
      source: source('msg-2', '2026-07-10T12:00:00.000Z'),
    });

    expect(result.change).toEqual({
      type: 'FIELD_CHANGED',
      orderItemId: 'item-1',
      field: 'profileColor',
      oldValue: 'white',
      newValue: 'brown',
      sourceMessageId: 'msg-2',
    });
    expect(result.memory.changes).toHaveLength(1);
    expect(getFactValue(result.memory.items[0]?.profileColor)).toBe('brown');
    expect(result.memory.items[0]?.profileColor?.history).toEqual([
      {
        value: 'white',
        sourceMessageId: 'msg-1',
        sourceChannel: 'telegram',
        sourceTimestamp: '2026-07-07T10:00:00.000Z',
      },
    ]);
    expect(result.memory.items[0]?.profileColor?.lastSeenSource).toEqual({
      sourceMessageId: 'msg-2',
      sourceChannel: 'telegram',
      sourceTimestamp: '2026-07-10T12:00:00.000Z',
    });
  });
});

describe('dealer order — two meshes must not mix', () => {
  it('keeps sizes and profile colors isolated per item', () => {
    let memory = createOrderMemory({
      orderId: 'dealer-order-1',
      conversationId: 'conv-dealer',
      itemIds: ['item-1', 'item-2'],
    });

    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'widthMm',
      value: 720,
      source: source('msg-a1', '2026-07-07T09:00:00.000Z'),
    }).memory;
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'heightMm',
      value: 1690,
      source: source('msg-a2', '2026-07-07T09:00:00.000Z'),
    }).memory;
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'profileColor',
      value: 'white',
      source: source('msg-a3', '2026-07-07T09:00:00.000Z'),
    }).memory;

    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-2',
      field: 'widthMm',
      value: 770,
      source: source('msg-b1', '2026-07-07T09:05:00.000Z'),
    }).memory;
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-2',
      field: 'heightMm',
      value: 1760,
      source: source('msg-b2', '2026-07-07T09:05:00.000Z'),
    }).memory;
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-2',
      field: 'profileColor',
      value: 'brown',
      source: source('msg-b3', '2026-07-07T09:05:00.000Z'),
    }).memory;

    const item1 = memory.items.find((item) => item.id === 'item-1');
    const item2 = memory.items.find((item) => item.id === 'item-2');

    expect(memory.items).toHaveLength(2);
    expect(getFactValue(item1?.widthMm)).toBe(720);
    expect(getFactValue(item1?.heightMm)).toBe(1690);
    expect(getFactValue(item1?.profileColor)).toBe('white');

    expect(getFactValue(item2?.widthMm)).toBe(770);
    expect(getFactValue(item2?.heightMm)).toBe(1760);
    expect(getFactValue(item2?.profileColor)).toBe('brown');

    // No cross-contamination
    expect(getFactValue(item1?.profileColor)).not.toBe(getFactValue(item2?.profileColor));
    expect(getFactValue(item1?.widthMm)).not.toBe(getFactValue(item2?.widthMm));
    expect(memory.changes).toEqual([]);
  });
});

describe('order change — муар → глянец with stable RAL', () => {
  it('records colorFinish change and does not invent RAL change', () => {
    let memory = createOrderMemory({
      orderId: 'order-finish',
      conversationId: 'conv-finish',
      itemIds: ['item-1'],
    });

    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'ral',
      value: '8028',
      source: source('msg-1', '2026-07-07T10:00:00.000Z'),
    }).memory;
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'colorFinish',
      value: 'муар',
      source: source('msg-1', '2026-07-07T10:00:00.000Z'),
    }).memory;

    const sameRal = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'ral',
      value: '8028',
      source: source('msg-2', '2026-07-10T10:00:00.000Z'),
    });
    expect(sameRal.change).toBeNull();
    memory = sameRal.memory;

    const finishChange = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'colorFinish',
      value: 'глянец',
      source: source('msg-2', '2026-07-10T10:00:00.000Z'),
    });
    memory = finishChange.memory;

    expect(finishChange.change).toEqual({
      type: 'FIELD_CHANGED',
      orderItemId: 'item-1',
      field: 'colorFinish',
      oldValue: 'муар',
      newValue: 'глянец',
      sourceMessageId: 'msg-2',
    });

    expect(getFactValue(memory.items[0]?.ral)).toBe('8028');
    expect(memory.items[0]?.ral?.history).toEqual([]);
    expect(memory.items[0]?.ral?.current.sourceMessageId).toBe('msg-1');
    expect(memory.items[0]?.ral?.lastSeenSource.sourceMessageId).toBe('msg-2');

    expect(getFactValue(memory.items[0]?.colorFinish)).toBe('глянец');
    expect(memory.items[0]?.colorFinish?.history).toEqual([
      {
        value: 'муар',
        sourceMessageId: 'msg-1',
        sourceChannel: 'telegram',
        sourceTimestamp: '2026-07-07T10:00:00.000Z',
      },
    ]);
    expect(memory.items[0]?.colorFinish?.current.sourceMessageId).toBe('msg-2');
    expect(memory.items[0]?.colorFinish?.lastSeenSource.sourceMessageId).toBe('msg-2');

    expect(memory.changes).toHaveLength(1);
    expect(memory.changes[0]?.field).toBe('colorFinish');
    expect(memory.changes.some((change) => change.field === 'ral')).toBe(false);
  });
});
