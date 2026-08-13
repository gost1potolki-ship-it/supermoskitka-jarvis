import type { Conversation } from '../src/domain/conversation.js';
import {
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
  type CalculationEngine,
  type CalculationRequest,
} from '../src/calculation/index.js';
import { ConversationOrchestrator } from '../src/jarvis/conversation/index.js';
import { FakeSystemPromptProvider } from '../src/jarvis/fake-system-prompt-provider.js';
import { CalculationTool, ToolRuntime } from '../src/jarvis/tools/index.js';
import {
  FakeLlmProvider,
  FakeToolCallingLlmProvider,
  fakeCalculateOrderCall,
} from '../src/llm/index.js';
import { InMemoryConversationStore } from '../src/storage/index.js';
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

class TrackingEngine implements CalculationEngine {
  readonly calls: CalculationRequest[] = [];
  constructor(private readonly inner: CalculationEngine) {}
  async calculate(request: CalculationRequest) {
    this.calls.push(request);
    return this.inner.calculate(request);
  }
}

function createTrackingEngine() {
  const inner = new SuperMoskitkaCalculationEngine(
    new StaticPriceCatalogProvider({
      version: 'current-prices-base@66465b1',
      prices: CURRENT_PRICE_CATALOG,
      businessRulesVersion: CURRENT_BUSINESS_RULES_VERSION,
      businessRules: CURRENT_BUSINESS_RULES,
    }),
  );
  return new TrackingEngine(inner);
}

async function seed(store: InMemoryConversationStore, mode: Conversation['mode'] = 'AI') {
  return store.createConversation({
    conversationId: 'conv-1',
    channel: 'telegram',
    customerId: 'customer-1',
    mode,
    createdAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
  });
}

describe('ConversationOrchestrator tool loop', () => {
  it('ORCH-TOOL-1 LLM requests calculation → engine → final AI text saved', async () => {
    const store = new InMemoryConversationStore();
    await seed(store);
    const engine = createTrackingEngine();
    const llm = new FakeToolCallingLlmProvider([
      {
        type: 'tool_calls',
        toolCalls: [fakeCalculateOrderCall('call_1', VALID_FRAME_ARGS)],
      },
      { type: 'text', text: 'Стоимость составит 3650 рублей.' },
    ]);
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { toolRuntime: new ToolRuntime(new CalculationTool(engine)) },
    );

    const result = await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm1',
      text: 'Сколько стоит рамочная 1000x1500 белая?',
    });

    expect(result.status).toBe('ai_replied');
    expect(engine.calls).toHaveLength(1);
    expect(llm.toolRequests).toHaveLength(2);
    if (result.status === 'ai_replied') {
      // PRICE-1 regression: wrong LLM amount must not reach the customer
      expect(result.replyText).toContain('1 790 ₽');
      expect(result.replyText).not.toContain('3650');
      expect(result.priceIntegrity?.accepted).toBe(false);
      expect(result.priceIntegrity?.authoritativeTotal).toBe(1790);
    }
  });

  it('ORCH-TOOL-2 invalid tool JSON → no engine execution', async () => {
    const store = new InMemoryConversationStore();
    await seed(store);
    const engine = createTrackingEngine();
    const llm = new FakeToolCallingLlmProvider([
      {
        type: 'tool_calls',
        toolCalls: [
          { id: 'call_bad', name: 'calculate_order', argumentsJson: '{broken' },
        ],
      },
      { type: 'text', text: 'Уточните, пожалуйста, параметры.' },
    ]);
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { toolRuntime: new ToolRuntime(new CalculationTool(engine)) },
    );

    await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm1',
      text: 'цена?',
    });

    expect(engine.calls).toHaveLength(0);
    const toolMessage = llm.toolRequests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.role === 'tool' ? toolMessage.content : '').toContain('invalid_arguments');
  });

  it('ORCH-TOOL-3 needs_input → clarification, no invented price', async () => {
    const store = new InMemoryConversationStore();
    await seed(store);
    const engine = createTrackingEngine();
    const incomplete = {
      mode: 'PRODUCT_ONLY',
      customerType: 'retail',
      items: [
        {
          itemId: 'item-1',
          productType: 'FRAME',
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
    const llm = new FakeToolCallingLlmProvider([
      {
        type: 'tool_calls',
        toolCalls: [fakeCalculateOrderCall('call_ni', incomplete)],
      },
      { type: 'text', text: 'Подскажите, пожалуйста, ширину и высоту сетки?' },
    ]);
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { toolRuntime: new ToolRuntime(new CalculationTool(engine)) },
    );

    const result = await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm1',
      text: 'Сколько рамочная?',
    });

    expect(engine.calls).toHaveLength(1);
    if (result.status === 'ai_replied') {
      expect(result.replyText).toMatch(/ширин|высот/i);
      expect(result.replyText).not.toMatch(/\d{3,}/);
    }
  });

  it('ORCH-TOOL-4 tool loop limit stops repetition', async () => {
    const store = new InMemoryConversationStore();
    await seed(store);
    const engine = createTrackingEngine();
    const llm = new FakeToolCallingLlmProvider([
      {
        type: 'tool_calls',
        toolCalls: [fakeCalculateOrderCall('c1', VALID_FRAME_ARGS)],
      },
      {
        type: 'tool_calls',
        toolCalls: [fakeCalculateOrderCall('c2', VALID_FRAME_ARGS)],
      },
      {
        type: 'tool_calls',
        toolCalls: [fakeCalculateOrderCall('c3', VALID_FRAME_ARGS)],
      },
      {
        type: 'tool_calls',
        toolCalls: [fakeCalculateOrderCall('c4', VALID_FRAME_ARGS)],
      },
    ]);
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      {
        toolRuntime: new ToolRuntime(new CalculationTool(engine)),
        maxToolRounds: 3,
        maxToolCallsPerTurn: 3,
      },
    );

    await expect(
      orchestrator.handleIncomingMessage({
        conversationId: 'conv-1',
        messageId: 'm1',
        text: 'считай',
      }),
    ).rejects.toThrow(/TOOL_LOOP_LIMIT/);
  });

  it('ORCH-TOOL-5 HUMAN mode → no LLM, no tool, no engine', async () => {
    const store = new InMemoryConversationStore();
    await seed(store, 'HUMAN');
    const engine = createTrackingEngine();
    const llm = new FakeToolCallingLlmProvider([{ type: 'text', text: 'nope' }]);
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { toolRuntime: new ToolRuntime(new CalculationTool(engine)) },
    );

    const result = await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm1',
      text: 'цена?',
    });

    expect(result.status).toBe('human_owned');
    expect(llm.toolRequests).toHaveLength(0);
    expect(engine.calls).toHaveLength(0);
  });

  it('ORCH-TOOL-6 raw tool messages not persisted', async () => {
    const store = new InMemoryConversationStore();
    await seed(store);
    const engine = createTrackingEngine();
    const llm = new FakeToolCallingLlmProvider([
      {
        type: 'tool_calls',
        toolCalls: [fakeCalculateOrderCall('call_1', VALID_FRAME_ARGS)],
      },
      { type: 'text', text: 'Готово: 3650 ₽' },
    ]);
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { toolRuntime: new ToolRuntime(new CalculationTool(engine)) },
    );

    await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm1',
      text: 'посчитайте',
    });

    const stored = await store.getMessages('conv-1');
    expect(stored.map((message) => message.sender)).toEqual(['CUSTOMER', 'AI']);
    expect(stored.some((message) => message.text.includes('widthMm'))).toBe(false);
    expect(stored.some((message) => message.text.includes('calculate_order'))).toBe(false);
    expect(stored[1]?.text).toContain('1 790 ₽');
    expect(stored[1]?.text).not.toContain('3650');
  });

  it('ORCH-TOOL-7 final AI answer persisted once (guarded)', async () => {
    const store = new InMemoryConversationStore();
    await seed(store);
    const engine = createTrackingEngine();
    const llm = new FakeToolCallingLlmProvider([
      {
        type: 'tool_calls',
        toolCalls: [fakeCalculateOrderCall('call_1', VALID_FRAME_ARGS)],
      },
      { type: 'text', text: 'Итого 3650' },
    ]);
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { toolRuntime: new ToolRuntime(new CalculationTool(engine)) },
    );

    await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm1',
      text: 'посчитайте',
    });

    const ai = (await store.getMessages('conv-1')).filter((message) => message.sender === 'AI');
    expect(ai).toHaveLength(1);
    expect(ai[0]?.text).toContain('1 790 ₽');
    expect(ai[0]?.text).not.toContain('3650');
  });

  it('ORCH-TOOL-8 provider without tool capability + enabled tools → config error', async () => {
    const store = new InMemoryConversationStore();
    await seed(store);
    const engine = createTrackingEngine();
    const llm = new FakeLlmProvider('text only');
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { toolRuntime: new ToolRuntime(new CalculationTool(engine)) },
    );

    await expect(
      orchestrator.handleIncomingMessage({
        conversationId: 'conv-1',
        messageId: 'm1',
        text: 'цена?',
      }),
    ).rejects.toThrow(/does not support tool calling/);
  });

  it('safety: final response contains engine total X', async () => {
    const store = new InMemoryConversationStore();
    await seed(store);
    const engine = createTrackingEngine();
    const preview = await engine.calculate({
      customerType: 'retail',
      items: [VALID_FRAME_ARGS.items[0]!],
    } as CalculationRequest);
    expect(preview.status).toBe('calculated');
    const total = preview.total!;

    const llm = new FakeToolCallingLlmProvider([
      {
        type: 'tool_calls',
        toolCalls: [fakeCalculateOrderCall('call_1', VALID_FRAME_ARGS)],
      },
      { type: 'text', text: `Стоимость заказа: ${total} руб.` },
    ]);
    const orchestrator = new ConversationOrchestrator(
      store,
      llm,
      new FakeSystemPromptProvider('SYS'),
      { toolRuntime: new ToolRuntime(new CalculationTool(engine)) },
    );

    const result = await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm1',
      text: 'Нужна одна белая рамочная 1000 на 1500, Z металлический, профиль 25',
    });

    expect(result.status).toBe('ai_replied');
    if (result.status === 'ai_replied') {
      expect(result.replyText.replace(/[\s\u00a0]/g, '')).toContain(String(total));
      expect(result.priceIntegrity?.accepted).toBe(true);
    }
  });
});
