import type { Conversation } from '../src/domain/conversation.js';
import { getFactValue } from '../src/domain/index.js';
import { ConversationOrchestrator } from '../src/jarvis/conversation/index.js';
import { FakeFactExtractor, emptyExtraction } from '../src/jarvis/extraction/index.js';
import { FakeSystemPromptProvider } from '../src/jarvis/fake-system-prompt-provider.js';
import { FakeLlmProvider, FakeToolCallingLlmProvider } from '../src/llm/index.js';
import { InMemoryConversationStore, InMemoryOrderMemoryStore } from '../src/storage/index.js';
import { describe, expect, it } from 'vitest';

async function seed(store: InMemoryConversationStore, mode: Conversation['mode'] = 'AI') {
  return store.createConversation({
    conversationId: 'conv-1',
    channel: 'telegram',
    customerId: 'customer-1',
    mode,
    createdAt: '2026-08-13T10:00:00.000Z',
    updatedAt: '2026-08-13T10:00:00.000Z',
  });
}

describe('ConversationOrchestrator fact extraction', () => {
  it('ORCH-FACT-1 AI mode → extractor after customer save, memory saved, main LLM called', async () => {
    const store = new InMemoryConversationStore();
    await seed(store);
    const memoryStore = new InMemoryOrderMemoryStore();
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
    ]);
    const llm = new FakeLlmProvider('Принял параметры.');
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: extractor, orderMemoryStore: memoryStore },
    );

    const result = await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm1',
      text: 'Нужна рамочная Антимошка.',
    });

    expect(extractor.requests).toHaveLength(1);
    expect(extractor.requests[0]?.currentMessage.id).toBe('m1');
    expect(result.status).toBe('ai_replied');
    expect(llm.requests).toHaveLength(1);
    const saved = await memoryStore.get('conv-1');
    expect(saved?.items).toHaveLength(1);
    expect(getFactValue(saved?.items[0]?.productType)).toBe('FRAME');
  });

  it('ORCH-FACT-2 HUMAN mode → extractor NOT called, LLM NOT called', async () => {
    const store = new InMemoryConversationStore();
    await seed(store, 'HUMAN');
    const extractor = new FakeFactExtractor([emptyExtraction()]);
    const llm = new FakeLlmProvider('nope');
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: extractor, orderMemoryStore: new InMemoryOrderMemoryStore() },
    );

    const result = await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm1',
      text: 'рамочная белая',
    });

    expect(result.status).toBe('human_owned');
    expect(extractor.requests).toHaveLength(0);
    expect(llm.requests).toHaveLength(0);
  });

  it('ORCH-FACT-3 extractor failure → memory unchanged, conversation continues', async () => {
    const store = new InMemoryConversationStore();
    await seed(store);
    const memoryStore = new InMemoryOrderMemoryStore();
    const extractor = new FakeFactExtractor([new Error('API down')]);
    const llm = new FakeLlmProvider('Могу помочь с заказом.');
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: extractor, orderMemoryStore: memoryStore },
    );

    const result = await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm1',
      text: 'Нужна рамочная.',
    });

    expect(result.status).toBe('ai_replied');
    if (result.status === 'ai_replied') {
      expect(result.replyText).toBe('Могу помочь с заказом.');
      expect(result.factExtraction?.failed).toBe(true);
      expect(result.replyText).not.toMatch(/fact extractor/i);
    }
    expect(await memoryStore.get('conv-1')).toBeNull();
    expect(llm.requests).toHaveLength(1);
  });

  it('ORCH-FACT-4 memory current context passed to main LLM', async () => {
    const store = new InMemoryConversationStore();
    await seed(store);
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
                field: 'widthMm',
                value: 1000,
                explicitness: 'EXPLICIT',
                evidenceText: '1000',
              },
              {
                field: 'heightMm',
                value: 1500,
                explicitness: 'EXPLICIT',
                evidenceText: '1500',
              },
              {
                field: 'meshType',
                value: 'ANTIMOSHKA',
                explicitness: 'EXPLICIT',
                evidenceText: 'Антимошка',
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
    ]);
    const llm = new FakeLlmProvider('Учёл параметры.');
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: extractor, orderMemoryStore: new InMemoryOrderMemoryStore() },
    );

    await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm1',
      text: 'Нужна одна рамочная сетка, размер готового изделия 1000×1500 мм, Антимошка, цвет белый.',
    });

    const systemMessages = llm.requests[0]?.messages.filter((message) => message.role === 'system');
    const memoryBlock = systemMessages?.find((message) =>
      message.content.includes('CURRENT ORDER MEMORY'),
    );
    expect(memoryBlock?.content).toContain('FRAME');
    expect(memoryBlock?.content).toContain('1000x1500');
    expect(memoryBlock?.content).toContain('ANTIMOSHKA');
    expect(memoryBlock?.content).toContain('WHITE');
    expect(memoryBlock?.content).not.toContain('sourceMessageId');
  });

  it('ORCH-FACT-5 raw extraction protocol not persisted as conversation message', async () => {
    const store = new InMemoryConversationStore();
    await seed(store);
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
    const llm = new FakeToolCallingLlmProvider([{ type: 'text', text: 'Принял.' }]);
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { factExtractor: extractor, orderMemoryStore: new InMemoryOrderMemoryStore() },
    );

    await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm1',
      text: 'Нужна рамочная.',
    });

    const stored = await store.getMessages('conv-1');
    expect(stored.map((message) => message.sender)).toEqual(['CUSTOMER', 'AI']);
    expect(stored.some((message) => message.text.includes('extract_order_facts'))).toBe(false);
    expect(stored.some((message) => message.text.includes('evidenceText'))).toBe(false);
  });
});
