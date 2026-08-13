import { getFactValue, type OrderMemory } from '../src/domain/index.js';
import {
  FakeFactExtractor,
  applyValidatedExtraction,
  emptyExtraction,
  parseExtractOrderFactsArguments,
  type FactExtractionRequest,
  type FactExtractionResult,
} from '../src/jarvis/extraction/index.js';
import { createOrderMemory } from '../src/jarvis/memory/index.js';
import { describe, expect, it } from 'vitest';

function requestFor(
  memory: OrderMemory,
  text: string,
  messageId = 'msg-1',
): FactExtractionRequest {
  return {
    conversationId: memory.conversationId,
    currentMessage: {
      id: messageId,
      text,
      channel: 'telegram',
      timestamp: '2026-08-13T10:00:00.000Z',
    },
    memorySnapshot: memory,
    recentContext: [],
  };
}

function apply(
  memory: OrderMemory,
  extraction: FactExtractionResult,
  text: string,
  messageId = 'msg-1',
) {
  return applyValidatedExtraction(memory, extraction, requestFor(memory, text, messageId));
}

describe('Fact extraction apply boundary', () => {
  it('FACT-1 explicit valid fact + evidence → applied', () => {
    const memory = createOrderMemory({
      orderId: 'o1',
      conversationId: 'c1',
      itemIds: ['item-1'],
    });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна белая сетка.',
    );
    expect(getFactValue(result.memory.items[0]?.profileColor)).toBe('WHITE');
    expect(result.memory.items[0]?.profileColor?.current.sourceMessageId).toBe('msg-1');
    expect(result.diagnostics.appliedFields).toContain('item:item-1.profileColor');
  });

  it('FACT-2 evidence absent from current message → rejected', () => {
    const memory = createOrderMemory({
      orderId: 'o1',
      conversationId: 'c1',
      itemIds: ['item-1'],
    });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'profileColor',
                value: 'BROWN_8017',
                explicitness: 'EXPLICIT',
                evidenceText: 'коричневая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна белая сетка.',
    );
    expect(getFactValue(result.memory.items[0]?.profileColor)).toBeUndefined();
    expect(result.diagnostics.issues.some((issue) => issue.code === 'EVIDENCE_MISMATCH')).toBe(
      true,
    );
  });

  it('FACT-3 UNCERTAIN fact → not applied', () => {
    const memory = createOrderMemory({
      orderId: 'o1',
      conversationId: 'c1',
      itemIds: ['item-1'],
    });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'quantity',
                value: 2,
                explicitness: 'UNCERTAIN',
                evidenceText: 'Наверное, будет две сетки',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Наверное, будет две сетки.',
    );
    expect(getFactValue(result.memory.items[0]?.quantity)).toBeUndefined();
  });

  it('FACT-4 HYPOTHETICAL fact → not applied', () => {
    const memory = createOrderMemory({
      orderId: 'o1',
      conversationId: 'c1',
      itemIds: ['item-1'],
    });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'profileColor',
                value: 'GRAY_7016',
                explicitness: 'HYPOTHETICAL',
                evidenceText: 'серый',
              },
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белый',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Если серый будет дороже, тогда оставим белый.',
    );
    expect(getFactValue(result.memory.items[0]?.profileColor)).toBe('WHITE');
  });

  it('FACT-5 unknown field → rejected', () => {
    const parsed = parseExtractOrderFactsArguments(
      JSON.stringify({
        itemProposals: [],
        customerFacts: [],
        fulfillmentFacts: [],
        secretDiscount: 50,
      }),
    );
    expect(parsed.ok).toBe(false);

    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1', itemIds: ['item-1'] });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'secretDiscount',
                value: 50,
                explicitness: 'EXPLICIT',
                evidenceText: 'скидка',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна скидка.',
    );
    expect(result.diagnostics.issues.some((issue) => issue.code === 'UNKNOWN_FIELD')).toBe(true);
  });

  it('FACT-6 unknown enum value → rejected', () => {
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1', itemIds: ['item-1'] });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'productType',
                value: 'MAGIC_NET',
                explicitness: 'EXPLICIT',
                evidenceText: 'сетка',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна сетка.',
    );
    expect(getFactValue(result.memory.items[0]?.productType)).toBeUndefined();
    expect(result.diagnostics.issues.some((issue) => issue.code === 'INVALID_VALUE')).toBe(true);
  });

  it('FACT-7 invented targetItemId → rejected', () => {
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1', itemIds: ['item-1'] });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-999',
            facts: [
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна белая.',
    );
    expect(result.diagnostics.issues.some((issue) => issue.code === 'UNKNOWN_ITEM_ID')).toBe(true);
    expect(getFactValue(result.memory.items[0]?.profileColor)).toBeUndefined();
  });

  it('FACT-8 CREATE item → Jarvis generates localItemId', () => {
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1' });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'CREATE',
            facts: [
              {
                field: 'productType',
                value: 'FRAME',
                explicitness: 'EXPLICIT',
                evidenceText: 'рамочная',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна рамочная сетка.',
    );
    expect(result.memory.items).toHaveLength(1);
    expect(result.memory.items[0]?.id).toBe('item-1');
    expect(getFactValue(result.memory.items[0]?.productType)).toBe('FRAME');
  });

  it('FACT-9 same value repeated → no OrderChange', () => {
    let memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1', itemIds: ['item-1'] });
    memory = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'Белая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Белая.',
      'msg-1',
    ).memory;
    const second = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Да, белая.',
      'msg-2',
    );
    expect(second.memory.changes).toHaveLength(0);
    expect(second.memory.items[0]?.profileColor?.lastSeenSource.sourceMessageId).toBe('msg-2');
    expect(second.memory.items[0]?.profileColor?.current.sourceMessageId).toBe('msg-1');
  });

  it('FACT-10 different explicit value → OrderChange + history', () => {
    let memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1', itemIds: ['item-1'] });
    memory = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна белая.',
      'msg-1',
    ).memory;
    const second = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'profileColor',
                value: 'BROWN_8017',
                explicitness: 'EXPLICIT',
                evidenceText: 'коричневая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нет, не белая, а коричневая.',
      'msg-2',
    );
    expect(getFactValue(second.memory.items[0]?.profileColor)).toBe('BROWN_8017');
    expect(second.memory.changes).toHaveLength(1);
    expect(second.memory.changes[0]).toMatchObject({
      field: 'profileColor',
      oldValue: 'WHITE',
      newValue: 'BROWN_8017',
    });
    expect(second.memory.items[0]?.profileColor?.history[0]?.value).toBe('WHITE');
    expect(second.memory.items[0]?.profileColor?.history[0]?.sourceMessageId).toBe('msg-1');
  });

  it('ITEM-EXTRACT-1 two items stay separate', () => {
    let memory = createOrderMemory({
      orderId: 'o1',
      conversationId: 'c1',
      itemIds: ['item-1', 'item-2'],
    });
    memory = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'widthMm',
                value: 720,
                explicitness: 'EXPLICIT',
                evidenceText: '720',
              },
              {
                field: 'heightMm',
                value: 1690,
                explicitness: 'EXPLICIT',
                evidenceText: '1690',
              },
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белая',
              },
            ],
          },
          {
            operation: 'UPDATE',
            targetItemId: 'item-2',
            facts: [
              {
                field: 'widthMm',
                value: 770,
                explicitness: 'EXPLICIT',
                evidenceText: '770',
              },
              {
                field: 'heightMm',
                value: 1760,
                explicitness: 'EXPLICIT',
                evidenceText: '1760',
              },
              {
                field: 'profileColor',
                value: 'BROWN_8017',
                explicitness: 'EXPLICIT',
                evidenceText: 'коричневая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Первая 720×1690 белая, вторая 770×1760 коричневая.',
    ).memory;
    expect(getFactValue(memory.items[0]?.profileColor)).toBe('WHITE');
    expect(getFactValue(memory.items[1]?.profileColor)).toBe('BROWN_8017');
    expect(getFactValue(memory.items[0]?.widthMm)).toBe(720);
    expect(getFactValue(memory.items[1]?.widthMm)).toBe(770);
  });

  it('ITEM-EXTRACT-2 second item correction changes only second item', () => {
    let memory = createOrderMemory({
      orderId: 'o1',
      conversationId: 'c1',
      itemIds: ['item-1', 'item-2'],
    });
    memory = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белые',
              },
            ],
          },
          {
            operation: 'UPDATE',
            targetItemId: 'item-2',
            facts: [
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белые',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Обе белые.',
    ).memory;
    memory = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetOrdinal: 2,
            facts: [
              {
                field: 'profileColor',
                value: 'BROWN_8017',
                explicitness: 'EXPLICIT',
                evidenceText: 'коричневая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Вторая сетка коричневая.',
      'msg-2',
    ).memory;
    expect(getFactValue(memory.items[0]?.profileColor)).toBe('WHITE');
    expect(getFactValue(memory.items[1]?.profileColor)).toBe('BROWN_8017');
  });

  it('ITEM-EXTRACT-3 out-of-range ordinal rejected', () => {
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1', itemIds: ['item-1'] });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetOrdinal: 9,
            facts: [
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна белая.',
    );
    expect(result.diagnostics.issues.some((issue) => issue.code === 'ORDINAL_OUT_OF_RANGE')).toBe(
      true,
    );
  });

  it('ITEM-EXTRACT-4 new item does not overwrite existing item', () => {
    let memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1', itemIds: ['item-1'] });
    memory = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна белая.',
    ).memory;
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'CREATE',
            facts: [
              {
                field: 'profileColor',
                value: 'BROWN_8017',
                explicitness: 'EXPLICIT',
                evidenceText: 'коричневая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Ещё одна коричневая.',
      'msg-2',
    );
    expect(result.memory.items).toHaveLength(2);
    expect(getFactValue(result.memory.items[0]?.profileColor)).toBe('WHITE');
    expect(result.memory.items[1]?.id).toBe('item-2');
    expect(getFactValue(result.memory.items[1]?.profileColor)).toBe('BROWN_8017');
  });

  it('SOURCE-* current customer message provenance is stored and kept in history', () => {
    let memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1', itemIds: ['item-1'] });
    memory = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'meshType',
                value: 'ANTIMOSHKA',
                explicitness: 'EXPLICIT',
                evidenceText: 'Антимошка',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Антимошка.',
      'msg-a',
    ).memory;
    const fact = memory.items[0]?.meshType;
    expect(fact?.current.sourceMessageId).toBe('msg-a');
    expect(fact?.current.sourceChannel).toBe('telegram');
    expect(fact?.current.sourceTimestamp).toBe('2026-08-13T10:00:00.000Z');

    const changed = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'meshType',
                value: 'STANDARD',
                explicitness: 'EXPLICIT',
                evidenceText: 'обычная',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нет, обычная.',
      'msg-b',
    );
    expect(changed.memory.items[0]?.meshType?.history[0]?.sourceMessageId).toBe('msg-a');
    expect(changed.memory.items[0]?.meshType?.current.sourceMessageId).toBe('msg-b');
  });

  it('RAL 8028 муар → глянец: RAL unchanged, finish change created', () => {
    let memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1', itemIds: ['item-1'] });
    memory = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              { field: 'ral', value: '8028', explicitness: 'EXPLICIT', evidenceText: '8028' },
              { field: 'colorFinish', value: 'муар', explicitness: 'EXPLICIT', evidenceText: 'муар' },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Цвет 8028 муар.',
      'msg-a',
    ).memory;
    const after = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              { field: 'ral', value: '8028', explicitness: 'EXPLICIT', evidenceText: '8028' },
              {
                field: 'colorFinish',
                value: 'глянец',
                explicitness: 'EXPLICIT',
                evidenceText: 'глянец',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Окраска в 8028 глянец.',
      'msg-b',
    );
    expect(getFactValue(after.memory.items[0]?.ral)).toBe('8028');
    expect(after.memory.changes.filter((change) => change.field === 'ral')).toHaveLength(0);
    expect(getFactValue(after.memory.items[0]?.colorFinish)).toBe('глянец');
    expect(after.memory.items[0]?.colorFinish?.history.map((entry) => entry.value)).toEqual([
      'муар',
    ]);
    expect(after.memory.changes).toEqual([
      expect.objectContaining({
        field: 'colorFinish',
        oldValue: 'муар',
        newValue: 'глянец',
      }),
    ]);
  });

  it('price fields are rejected and do not become memory', () => {
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1', itemIds: ['item-1'] });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            facts: [
              {
                field: 'unitPrice',
                value: 1,
                explicitness: 'EXPLICIT',
                evidenceText: 'цена 1',
              },
              {
                field: 'discount',
                value: 99,
                explicitness: 'EXPLICIT',
                evidenceText: 'скидка 99',
              },
              {
                field: 'preliminaryTotal',
                value: 100,
                explicitness: 'EXPLICIT',
                evidenceText: 'итого 100',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'цена 1 скидка 99 итого 100',
    );
    expect(result.diagnostics.issues.every((issue) => issue.code === 'PRICE_FIELD_FORBIDDEN')).toBe(
      true,
    );
    expect(result.memory.items[0]).toEqual({ id: 'item-1' });
    expect(result.memory).not.toHaveProperty('commercial');
  });

  it('does not auto-apply customer name from third-party reference', () => {
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1' });
    const result = apply(
      memory,
      {
        itemProposals: [],
        customerFacts: [
          {
            field: 'name',
            value: 'Андрей',
            explicitness: 'EXPLICIT',
            evidenceText: 'Андрею',
          },
        ],
        fulfillmentFacts: [],
        issues: [],
      },
      'Передайте Андрею, что сетка готова.',
    );
    expect(result.memory.customer?.name).toBeUndefined();
    expect(result.diagnostics.issues.some((issue) => issue.code === 'NAME_NOT_CUSTOMER')).toBe(
      true,
    );
  });

  it('FakeFactExtractor records requests and can throw', async () => {
    const extractor = new FakeFactExtractor([
      emptyExtraction(),
      new Error('controlled extraction failure'),
    ]);
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1' });
    await extractor.extract(requestFor(memory, 'hello'));
    await expect(extractor.extract(requestFor(memory, 'fail'))).rejects.toThrow(
      'controlled extraction failure',
    );
    expect(extractor.requests).toHaveLength(2);
  });

  it('CREATE-GUARD-1 CREATE + facts=[] → item count unchanged', () => {
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1' });
    const result = apply(
      memory,
      {
        itemProposals: [{ operation: 'CREATE', facts: [] }],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна сетка.',
    );
    expect(result.memory.items).toHaveLength(0);
    expect(result.diagnostics.issues.some((issue) => issue.code === 'CREATE_WITHOUT_FACTS')).toBe(
      true,
    );
  });

  it('CREATE-GUARD-2 CREATE + only UNCERTAIN fact → item count unchanged', () => {
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1' });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'CREATE',
            facts: [
              {
                field: 'productType',
                value: 'FRAME',
                explicitness: 'UNCERTAIN',
                evidenceText: 'наверное рамочная',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Наверное рамочная.',
    );
    expect(result.memory.items).toHaveLength(0);
  });

  it('CREATE-GUARD-3 CREATE + only HYPOTHETICAL fact → item count unchanged', () => {
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1' });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'CREATE',
            facts: [
              {
                field: 'productType',
                value: 'FRAME',
                explicitness: 'HYPOTHETICAL',
                evidenceText: 'если рамочная',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Если рамочная будет дешевле, возьмём.',
    );
    expect(result.memory.items).toHaveLength(0);
  });

  it('CREATE-GUARD-4 CREATE + EXPLICIT fact with invalid evidence → item count unchanged', () => {
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1' });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'CREATE',
            facts: [
              {
                field: 'productType',
                value: 'FRAME',
                explicitness: 'EXPLICIT',
                evidenceText: 'рамочная',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна сетка.',
    );
    expect(result.memory.items).toHaveLength(0);
  });

  it('CREATE-GUARD-5 CREATE + one valid EXPLICIT fact → exactly one item created', () => {
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1' });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'CREATE',
            facts: [
              {
                field: 'productType',
                value: 'FRAME',
                explicitness: 'EXPLICIT',
                evidenceText: 'рамочная',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна рамочная.',
    );
    expect(result.memory.items).toHaveLength(1);
    expect(getFactValue(result.memory.items[0]?.productType)).toBe('FRAME');
  });

  it('CREATE-GUARD-6 generated item id is Jarvis-owned', () => {
    const memory = createOrderMemory({ orderId: 'o1', conversationId: 'c1' });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'CREATE',
            targetItemId: 'extractor-owned-id',
            facts: [
              {
                field: 'productType',
                value: 'WING',
                explicitness: 'EXPLICIT',
                evidenceText: 'крыло',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужно крыло.',
    );
    expect(result.memory.items).toHaveLength(1);
    expect(result.memory.items[0]?.id).toBe('item-1');
    expect(result.memory.items[0]?.id).not.toBe('extractor-owned-id');
  });

  it('TARGET-1 only targetItemId valid → update accepted', () => {
    let memory = createOrderMemory({
      orderId: 'o1',
      conversationId: 'c1',
      itemIds: ['item-1', 'item-2'],
    });
    memory = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-2',
            facts: [
              {
                field: 'profileColor',
                value: 'BROWN_8017',
                explicitness: 'EXPLICIT',
                evidenceText: 'коричневая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Вторая коричневая.',
    ).memory;
    expect(getFactValue(memory.items[1]?.profileColor)).toBe('BROWN_8017');
    expect(getFactValue(memory.items[0]?.profileColor)).toBeUndefined();
  });

  it('TARGET-2 only targetOrdinal valid → update accepted', () => {
    let memory = createOrderMemory({
      orderId: 'o1',
      conversationId: 'c1',
      itemIds: ['item-1', 'item-2'],
    });
    memory = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetOrdinal: 1,
            facts: [
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Первая белая.',
    ).memory;
    expect(getFactValue(memory.items[0]?.profileColor)).toBe('WHITE');
  });

  it('TARGET-3 both point to same item → update accepted', () => {
    let memory = createOrderMemory({
      orderId: 'o1',
      conversationId: 'c1',
      itemIds: ['item-1', 'item-2'],
    });
    memory = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-2',
            targetOrdinal: 2,
            facts: [
              {
                field: 'profileColor',
                value: 'GRAY_7016',
                explicitness: 'EXPLICIT',
                evidenceText: 'серая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Вторая серая.',
    ).memory;
    expect(getFactValue(memory.items[1]?.profileColor)).toBe('GRAY_7016');
  });

  it('TARGET-4 both point to different items → reject', () => {
    const memory = createOrderMemory({
      orderId: 'o1',
      conversationId: 'c1',
      itemIds: ['item-1', 'item-2'],
    });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            targetOrdinal: 2,
            facts: [
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна белая.',
    );
    expect(result.diagnostics.issues.some((issue) => issue.code === 'TARGET_CONFLICT')).toBe(true);
    expect(getFactValue(result.memory.items[0]?.profileColor)).toBeUndefined();
    expect(getFactValue(result.memory.items[1]?.profileColor)).toBeUndefined();
  });

  it('TARGET-5 one valid + one out of range → reject', () => {
    const memory = createOrderMemory({
      orderId: 'o1',
      conversationId: 'c1',
      itemIds: ['item-1'],
    });
    const result = apply(
      memory,
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetItemId: 'item-1',
            targetOrdinal: 9,
            facts: [
              {
                field: 'profileColor',
                value: 'WHITE',
                explicitness: 'EXPLICIT',
                evidenceText: 'белая',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
      'Нужна белая.',
    );
    expect(result.diagnostics.issues.some((issue) => issue.code === 'TARGET_CONFLICT')).toBe(true);
    expect(getFactValue(result.memory.items[0]?.profileColor)).toBeUndefined();
  });
});
