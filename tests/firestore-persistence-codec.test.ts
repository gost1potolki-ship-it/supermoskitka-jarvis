import {
  PersistenceDataError,
  createFact,
  getFactValue,
  type Conversation,
  type Message,
  type OrderMemory,
} from '../src/domain/index.js';
import {
  buildConversationDocument,
  buildOrderMemoryDocument,
  decodeConversationDocument,
  decodeOrderMemoryDocument,
} from '../src/infrastructure/firestore/index.js';
import { addOrderItem, applyOrderItemFact, createOrderMemory } from '../src/jarvis/memory/index.js';
import { describe, expect, it } from 'vitest';

const SOURCE = {
  sourceMessageId: 'msg-1',
  sourceChannel: 'telegram' as const,
  sourceTimestamp: '2026-08-13T10:00:00.000Z',
};

function sampleConversation(): { conversation: Conversation; messages: Message[] } {
  return {
    conversation: {
      conversationId: 'conv-codec-1',
      channel: 'telegram',
      customerId: 'customer-1',
      mode: 'AI',
      createdAt: '2026-08-13T10:00:00.000Z',
      updatedAt: '2026-08-13T10:01:00.000Z',
    },
    messages: [
      {
        messageId: 'm2',
        conversationId: 'conv-codec-1',
        channel: 'telegram',
        sender: 'AI',
        text: 'Принял.',
        createdAt: '2026-08-13T10:01:00.000Z',
      },
      {
        messageId: 'm1',
        conversationId: 'conv-codec-1',
        channel: 'telegram',
        sender: 'CUSTOMER',
        text: 'Нужна рамочная белая',
        createdAt: '2026-08-13T10:00:30.000Z',
      },
    ],
  };
}

function sampleMemoryWithWhite(): OrderMemory {
  let memory = createOrderMemory({
    orderId: 'conv-codec-1',
    conversationId: 'conv-codec-1',
    now: SOURCE.sourceTimestamp,
  });
  memory = addOrderItem(memory, 'item-1', SOURCE.sourceTimestamp);
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'productType',
    value: 'FRAME',
    source: SOURCE,
  }).memory;
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'profileColor',
    value: 'WHITE',
    source: SOURCE,
  }).memory;
  return memory;
}

describe('Firestore persistence codec', () => {
  it('PERSIST-CODEC-1 Conversation domain → db → domain equivalent', () => {
    const { conversation, messages } = sampleConversation();
    const doc = buildConversationDocument(conversation, messages, 3);
    const decoded = decodeConversationDocument(doc);
    expect(decoded.revision).toBe(3);
    expect(decoded.conversation.conversationId).toBe(conversation.conversationId);
    expect(decoded.conversation.mode).toBe('AI');
    expect(decoded.conversation.revision).toBe(3);
    expect(decoded.messages.map((m) => m.messageId)).toEqual(['m1', 'm2']);
    expect(decoded.messages[0]?.text).toBe('Нужна рамочная белая');
  });

  it('PERSIST-CODEC-2 OrderMemory domain → db → domain equivalent', () => {
    const memory = sampleMemoryWithWhite();
    const doc = buildOrderMemoryDocument(memory, 2);
    const decoded = decodeOrderMemoryDocument(doc);
    expect(decoded.revision).toBe(2);
    expect(decoded.memory.revision).toBe(2);
    expect(getFactValue(decoded.memory.items[0]?.productType)).toBe('FRAME');
    expect(getFactValue(decoded.memory.items[0]?.profileColor)).toBe('WHITE');
  });

  it('PERSIST-CODEC-3 FactSource preserved', () => {
    const memory = sampleMemoryWithWhite();
    const decoded = decodeOrderMemoryDocument(buildOrderMemoryDocument(memory, 1)).memory;
    const fact = decoded.items[0]?.profileColor;
    expect(fact?.current.sourceMessageId).toBe(SOURCE.sourceMessageId);
    expect(fact?.current.sourceChannel).toBe(SOURCE.sourceChannel);
    expect(fact?.current.sourceTimestamp).toBe(SOURCE.sourceTimestamp);
    expect(fact?.lastSeenSource).toEqual(SOURCE);
  });

  it('PERSIST-CODEC-4 OrderChange preserved', () => {
    let memory = sampleMemoryWithWhite();
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'profileColor',
      value: 'GRAY_7016',
      source: { ...SOURCE, sourceMessageId: 'msg-2', sourceTimestamp: '2026-08-13T10:05:00.000Z' },
    }).memory;
    const decoded = decodeOrderMemoryDocument(buildOrderMemoryDocument(memory, 1)).memory;
    expect(decoded.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'profileColor',
          oldValue: 'WHITE',
          newValue: 'GRAY_7016',
          sourceMessageId: 'msg-2',
        }),
      ]),
    );
  });

  it('PERSIST-CODEC-5 WHITE remains WHITE', () => {
    const memory = sampleMemoryWithWhite();
    const decoded = decodeOrderMemoryDocument(buildOrderMemoryDocument(memory, 1)).memory;
    expect(getFactValue(decoded.items[0]?.profileColor)).toBe('WHITE');
    expect(getFactValue(decoded.items[0]?.profileColor)).not.toBe('GRAY_7016');
  });

  it('PERSIST-CODEC-6 GRAY_7016 + ral 7016 preserved', () => {
    let memory = sampleMemoryWithWhite();
    const graySource = {
      ...SOURCE,
      sourceMessageId: 'msg-2',
      sourceTimestamp: '2026-08-13T10:05:00.000Z',
    };
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'profileColor',
      value: 'GRAY_7016',
      source: graySource,
    }).memory;
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'ral',
      value: '7016',
      source: graySource,
    }).memory;
    const decoded = decodeOrderMemoryDocument(buildOrderMemoryDocument(memory, 1)).memory;
    expect(getFactValue(decoded.items[0]?.profileColor)).toBe('GRAY_7016');
    expect(getFactValue(decoded.items[0]?.ral)).toBe('7016');
  });

  it('PERSIST-CODEC-7 invalid enum fails closed', () => {
    const memory = sampleMemoryWithWhite();
    const doc = buildOrderMemoryDocument(memory, 1) as {
      memory: { items: Array<Record<string, unknown>> };
    };
    const item = doc.memory.items[0]!;
    item.profileColor = {
      current: {
        value: 'MAGIC_BLUE',
        sourceMessageId: 'x',
        sourceChannel: 'telegram',
        sourceTimestamp: SOURCE.sourceTimestamp,
      },
      history: [],
      lastSeenSource: SOURCE,
    };
    expect(() => decodeOrderMemoryDocument(doc)).toThrow(PersistenceDataError);
  });

  it('PERSIST-CODEC customer Fact with createFact round-trip', () => {
    const memory = sampleMemoryWithWhite();
    memory.customer = {
      name: createFact('Test Customer', SOURCE),
      phone: createFact('+79990000000', SOURCE),
    };
    const decoded = decodeOrderMemoryDocument(buildOrderMemoryDocument(memory, 1)).memory;
    expect(getFactValue(decoded.customer?.name)).toBe('Test Customer');
    expect(getFactValue(decoded.customer?.phone)).toBe('+79990000000');
  });
});
