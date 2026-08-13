import { getFactValue, type Conversation } from '../src/domain/index.js';
import {
  createPersistentJarvisRuntime,
  InMemoryFirestoreGateway,
} from '../src/infrastructure/firestore/index.js';
import { ConversationOrchestrator } from '../src/jarvis/conversation/index.js';
import { FakeFactExtractor, emptyExtraction } from '../src/jarvis/extraction/index.js';
import { FakeSystemPromptProvider } from '../src/jarvis/fake-system-prompt-provider.js';
import {
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
} from '../src/calculation/index.js';
import { CalculationTool, ToolRuntime } from '../src/jarvis/tools/index.js';
import {
  FakeLlmProvider,
  FakeToolCallingLlmProvider,
  fakeCalculateOrderCall,
} from '../src/llm/index.js';
import { CURRENT_PRICE_CATALOG } from './fixtures/calculation-prices-current.js';
import { describe, expect, it } from 'vitest';

const VALID_FRAME_ARGS = {
  mode: 'PRODUCT_ONLY',
  customerType: 'retail',
  items: [
    {
      itemId: 'item-1',
      productType: 'FRAME',
      widthMm: 1000,
      heightMm: 1500,
      quantity: 1,
      meshType: 'STANDARD',
      color: { kind: 'WHITE' },
      fastening: 'Z_METAL',
      frameProfile: '25',
      cornerType: 'PLASTIC',
      handleType: 'PLASTIC',
    },
  ],
};

async function seed(
  conversationStore: Awaited<ReturnType<typeof createPersistentJarvisRuntime>>['conversationStore'],
  conversationId: string,
  mode: Conversation['mode'] = 'AI',
) {
  return conversationStore.createConversation({
    conversationId,
    channel: 'telegram',
    customerId: 'customer-1',
    mode,
    createdAt: '2026-08-13T10:00:00.000Z',
    updatedAt: '2026-08-13T10:00:00.000Z',
  });
}

describe('Orchestrator Firestore persistence', () => {
  it('ORCH-PERSIST-1 conversation loaded from store before turn', async () => {
    const { conversationStore, orderMemoryStore } = createPersistentJarvisRuntime({
      gateway: new InMemoryFirestoreGateway(),
    });
    await seed(conversationStore, 'conv-p1');
    const llm = new FakeLlmProvider('ok');
    const orchestrator = new ConversationOrchestrator(
      conversationStore,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: new FakeFactExtractor([emptyExtraction()]), orderMemoryStore },
    );
    const result = await orchestrator.handleIncomingMessage({
      conversationId: 'conv-p1',
      messageId: 'm1',
      text: 'привет',
    });
    expect(result.status).toBe('ai_replied');
    expect(result.conversation.conversationId).toBe('conv-p1');
  });

  it('ORCH-PERSIST-2 customer message persisted', async () => {
    const { conversationStore, orderMemoryStore } = createPersistentJarvisRuntime({
      gateway: new InMemoryFirestoreGateway(),
    });
    await seed(conversationStore, 'conv-p2');
    const orchestrator = new ConversationOrchestrator(
      conversationStore,
      new FakeLlmProvider('ok'),
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: new FakeFactExtractor([emptyExtraction()]), orderMemoryStore },
    );
    await orchestrator.handleIncomingMessage({
      conversationId: 'conv-p2',
      messageId: 'm1',
      text: 'нужна рамочная',
    });
    const messages = await conversationStore.getMessages('conv-p2');
    expect(messages[0]?.sender).toBe('CUSTOMER');
    expect(messages[0]?.text).toBe('нужна рамочная');
  });

  it('ORCH-PERSIST-3 fact extraction memory persisted', async () => {
    const { conversationStore, orderMemoryStore } = createPersistentJarvisRuntime({
      gateway: new InMemoryFirestoreGateway(),
    });
    await seed(conversationStore, 'conv-p3');
    const extractor = new FakeFactExtractor([
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
    ]);
    const orchestrator = new ConversationOrchestrator(
      conversationStore,
      new FakeLlmProvider('ok'),
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: extractor, orderMemoryStore },
    );
    await orchestrator.handleIncomingMessage({
      conversationId: 'conv-p3',
      messageId: 'm1',
      text: 'Нужна рамочная белая',
    });
    const memory = await orderMemoryStore.get('conv-p3');
    expect(getFactValue(memory?.items[0]?.productType)).toBe('FRAME');
    expect(getFactValue(memory?.items[0]?.profileColor)).toBe('WHITE');
    expect(memory?.revision).toBe(1);
  });

  it('ORCH-PERSIST-4 final guarded AI text persisted', async () => {
    const { conversationStore, orderMemoryStore } = createPersistentJarvisRuntime({
      gateway: new InMemoryFirestoreGateway(),
    });
    await seed(conversationStore, 'conv-p4');
    const orchestrator = new ConversationOrchestrator(
      conversationStore,
      new FakeLlmProvider('Финальный ответ.'),
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: new FakeFactExtractor([emptyExtraction()]), orderMemoryStore },
    );
    await orchestrator.handleIncomingMessage({
      conversationId: 'conv-p4',
      messageId: 'm1',
      text: 'привет',
    });
    const messages = await conversationStore.getMessages('conv-p4');
    expect(messages.map((m) => m.sender)).toEqual(['CUSTOMER', 'AI']);
    expect(messages[1]?.text).toBe('Финальный ответ.');
  });

  it('ORCH-PERSIST-5 synthetic memory context NOT persisted', async () => {
    const { conversationStore, orderMemoryStore } = createPersistentJarvisRuntime({
      gateway: new InMemoryFirestoreGateway(),
    });
    await seed(conversationStore, 'conv-p5');
    const extractor = new FakeFactExtractor([
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
    ]);
    await new ConversationOrchestrator(
      conversationStore,
      new FakeLlmProvider('ok'),
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: extractor, orderMemoryStore },
    ).handleIncomingMessage({
      conversationId: 'conv-p5',
      messageId: 'm1',
      text: 'Нужна рамочная',
    });
    const stored = await conversationStore.getMessages('conv-p5');
    expect(stored.some((m) => m.text.includes('[INTERNAL ORDER MEMORY DATA]'))).toBe(false);
  });

  it('ORCH-PERSIST-6 tool protocol NOT persisted', async () => {
    const { conversationStore, orderMemoryStore } = createPersistentJarvisRuntime({
      gateway: new InMemoryFirestoreGateway(),
    });
    await seed(conversationStore, 'conv-p6');
    const engine = new SuperMoskitkaCalculationEngine(
      new StaticPriceCatalogProvider({
        version: 'current-prices-base@66465b1',
        prices: CURRENT_PRICE_CATALOG,
        businessRulesVersion: CURRENT_BUSINESS_RULES_VERSION,
        businessRules: CURRENT_BUSINESS_RULES,
      }),
    );
    const llm = new FakeToolCallingLlmProvider([
      {
        type: 'tool_calls',
        toolCalls: [fakeCalculateOrderCall('call-1', VALID_FRAME_ARGS)],
      },
      { type: 'text', text: 'Итого по изделию.' },
    ]);
    const toolRuntime = new ToolRuntime(new CalculationTool(engine));
    await new ConversationOrchestrator(
      conversationStore,
      llm,
      new FakeSystemPromptProvider('SYS'),
      {
        factExtractor: new FakeFactExtractor([emptyExtraction()]),
        orderMemoryStore,
        toolRuntime,
      },
    ).handleIncomingMessage({
      conversationId: 'conv-p6',
      messageId: 'm1',
      text: 'посчитай',
    });
    const stored = await conversationStore.getMessages('conv-p6');
    expect(stored.map((m) => m.sender)).toEqual(['CUSTOMER', 'AI']);
    expect(stored.some((m) => m.text.includes('calculate_order'))).toBe(false);
    expect(stored.some((m) => m.text.includes('tool_calls'))).toBe(false);
  });
});

describe('Firestore restart regressions', () => {
  it('restart restores FRAME + WHITE conversation and memory', async () => {
    const gateway = new InMemoryFirestoreGateway();
    const runtimeA = createPersistentJarvisRuntime({ gateway });
    await seed(runtimeA.conversationStore, 'conv-restart');
    const extractor = new FakeFactExtractor([
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
    ]);
    await new ConversationOrchestrator(
      runtimeA.conversationStore,
      new FakeLlmProvider('ok'),
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: extractor, orderMemoryStore: runtimeA.orderMemoryStore },
    ).handleIncomingMessage({
      conversationId: 'conv-restart',
      messageId: 'm1',
      text: 'Нужна рамочная белая',
    });

    const runtimeB = createPersistentJarvisRuntime({ gateway });
    const conversation = await runtimeB.conversationStore.getConversation('conv-restart');
    const messages = await runtimeB.conversationStore.getMessages('conv-restart');
    const memory = await runtimeB.orderMemoryStore.get('conv-restart');
    expect(conversation?.mode).toBe('AI');
    expect(messages.map((m) => m.sender)).toEqual(['CUSTOMER', 'AI']);
    expect(getFactValue(memory?.items[0]?.productType)).toBe('FRAME');
    expect(getFactValue(memory?.items[0]?.profileColor)).toBe('WHITE');
  });

  it('correction restart: WHITE → GRAY_7016 + ral history', async () => {
    const gateway = new InMemoryFirestoreGateway();
    const runtimeA = createPersistentJarvisRuntime({ gateway });
    await seed(runtimeA.conversationStore, 'conv-color');
    const extractor = new FakeFactExtractor([
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
      {
        itemProposals: [
          {
            operation: 'UPDATE',
            targetOrdinal: 1,
            facts: [
              {
                field: 'profileColor',
                value: 'GRAY_7016',
                explicitness: 'EXPLICIT',
                evidenceText: 'серый',
              },
              {
                field: 'ral',
                value: '7016',
                explicitness: 'EXPLICIT',
                evidenceText: '7016',
              },
            ],
          },
        ],
        customerFacts: [],
        fulfillmentFacts: [],
        issues: [],
      },
    ]);
    const orch = new ConversationOrchestrator(
      runtimeA.conversationStore,
      new FakeLlmProvider('ok'),
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: extractor, orderMemoryStore: runtimeA.orderMemoryStore },
    );
    await orch.handleIncomingMessage({
      conversationId: 'conv-color',
      messageId: 'm1',
      text: 'рамочная белый',
    });
    await orch.handleIncomingMessage({
      conversationId: 'conv-color',
      messageId: 'm2',
      text: 'серый RAL 7016',
    });

    const runtimeB = createPersistentJarvisRuntime({ gateway });
    const memory = await runtimeB.orderMemoryStore.get('conv-color');
    expect(getFactValue(memory?.items[0]?.profileColor)).toBe('GRAY_7016');
    expect(getFactValue(memory?.items[0]?.ral)).toBe('7016');
    expect(memory?.items[0]?.profileColor?.history.some((e) => e.value === 'WHITE')).toBe(true);
    expect(
      memory?.changes.some(
        (c) =>
          c.field === 'profileColor' && c.oldValue === 'WHITE' && c.newValue === 'GRAY_7016',
      ),
    ).toBe(true);
  });

  it('HUMAN mode persists across restart and silences extractor/LLM', async () => {
    const gateway = new InMemoryFirestoreGateway();
    const runtimeA = createPersistentJarvisRuntime({ gateway });
    const created = await seed(runtimeA.conversationStore, 'conv-human', 'AI');
    await runtimeA.conversationStore.saveConversation({
      ...created,
      mode: 'HUMAN',
      updatedAt: '2026-08-13T10:05:00.000Z',
    });

    const runtimeB = createPersistentJarvisRuntime({ gateway });
    const extractor = new FakeFactExtractor([emptyExtraction()]);
    const llm = new FakeLlmProvider('should-not-run');
    const result = await new ConversationOrchestrator(
      runtimeB.conversationStore,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: extractor, orderMemoryStore: runtimeB.orderMemoryStore },
    ).handleIncomingMessage({
      conversationId: 'conv-human',
      messageId: 'm1',
      text: 'рамочная белая',
    });

    expect((await runtimeB.conversationStore.getConversation('conv-human'))?.mode).toBe('HUMAN');
    expect(result.status).toBe('human_owned');
    expect(extractor.requests).toHaveLength(0);
    expect(llm.requests).toHaveLength(0);
  });
});
