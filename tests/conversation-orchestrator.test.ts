import type { Conversation } from '../src/domain/conversation.js';
import type { Message } from '../src/domain/message.js';
import { ConversationOrchestrator } from '../src/jarvis/conversation/index.js';
import { FakeLlmProvider } from '../src/llm/index.js';
import { InMemoryConversationStore } from '../src/storage/index.js';
import { describe, expect, it } from 'vitest';

async function seedConversation(
  store: InMemoryConversationStore,
  overrides: Partial<Conversation> = {},
): Promise<Conversation> {
  return store.createConversation({
    conversationId: 'conv-1',
    channel: 'telegram',
    customerId: 'customer-1',
    mode: 'AI',
    createdAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  });
}

async function appendHistory(
  store: InMemoryConversationStore,
  messages: Array<Omit<Message, 'channel'> & { channel?: Message['channel'] }>,
): Promise<void> {
  for (const item of messages) {
    await store.appendMessage({
      channel: 'telegram',
      ...item,
    });
  }
}

describe('ConversationOrchestrator', () => {
  it('Case A — AI mode stores customer message, calls LLM once, and saves AI reply', async () => {
    const store = new InMemoryConversationStore();
    await seedConversation(store, { mode: 'AI' });
    const llm = new FakeLlmProvider('Тестовый ответ Jarvis');
    const orchestrator = new ConversationOrchestrator(store, llm);

    const result = await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'msg-customer-1',
      text: 'Здравствуйте, сколько стоит москитная сетка?',
      createdAt: '2026-08-12T10:01:00.000Z',
    });

    expect(result.status).toBe('ai_replied');
    if (result.status !== 'ai_replied') {
      return;
    }

    expect(result.customerMessage.sender).toBe('CUSTOMER');
    expect(result.customerMessage.text).toBe('Здравствуйте, сколько стоит москитная сетка?');
    expect(result.replyText).toBe('Тестовый ответ Jarvis');
    expect(result.aiMessage.sender).toBe('AI');
    expect(result.aiMessage.text).toBe('Тестовый ответ Jarvis');

    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0]?.conversationId).toBe('conv-1');
    expect(llm.requests[0]?.messages).toEqual([
      {
        role: 'user',
        content: 'Здравствуйте, сколько стоит москитная сетка?',
      },
    ]);

    const stored = await store.getMessages('conv-1');
    expect(stored.map((message) => message.sender)).toEqual(['CUSTOMER', 'AI']);
  });

  it('Case B — HUMAN mode stores customer message and does not call LLM', async () => {
    const store = new InMemoryConversationStore();
    await seedConversation(store, { mode: 'HUMAN' });
    const llm = new FakeLlmProvider('не должен появиться');
    const orchestrator = new ConversationOrchestrator(store, llm);

    const result = await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'msg-customer-2',
      text: 'Можно уточнить срок?',
      createdAt: '2026-08-12T10:02:00.000Z',
    });

    expect(result).toEqual({
      status: 'human_owned',
      conversation: expect.objectContaining({ mode: 'HUMAN' }),
      customerMessage: expect.objectContaining({
        messageId: 'msg-customer-2',
        sender: 'CUSTOMER',
        text: 'Можно уточнить срок?',
      }),
    });
    expect(llm.requests).toHaveLength(0);

    const stored = await store.getMessages('conv-1');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.sender).toBe('CUSTOMER');
  });

  it('Case C — LLM receives full multi-turn history in order', async () => {
    const store = new InMemoryConversationStore();
    await seedConversation(store, { mode: 'AI' });
    await appendHistory(store, [
      {
        messageId: 'm1',
        conversationId: 'conv-1',
        sender: 'CUSTOMER',
        text: 'Нужна сетка',
        createdAt: '2026-08-12T10:00:01.000Z',
      },
      {
        messageId: 'm2',
        conversationId: 'conv-1',
        sender: 'AI',
        text: 'На какое окно?',
        createdAt: '2026-08-12T10:00:02.000Z',
      },
      {
        messageId: 'm3',
        conversationId: 'conv-1',
        sender: 'CUSTOMER',
        text: 'На балконную дверь',
        createdAt: '2026-08-12T10:00:03.000Z',
      },
    ]);

    const llm = new FakeLlmProvider('Тестовый ответ Jarvis');
    const orchestrator = new ConversationOrchestrator(store, llm);

    await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm4',
      text: 'И сколько это будет стоить?',
      createdAt: '2026-08-12T10:00:04.000Z',
    });

    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0]?.messages).toEqual([
      { role: 'user', content: 'Нужна сетка' },
      { role: 'assistant', content: 'На какое окно?' },
      { role: 'user', content: 'На балконную дверь' },
      { role: 'user', content: 'И сколько это будет стоить?' },
    ]);
  });

  it('Case D — HUMAN history messages map to assistant role', async () => {
    const store = new InMemoryConversationStore();
    await seedConversation(store, { mode: 'AI' });
    await appendHistory(store, [
      {
        messageId: 'm1',
        conversationId: 'conv-1',
        sender: 'CUSTOMER',
        text: 'Нужна сетка на дверь',
        createdAt: '2026-08-12T10:00:01.000Z',
      },
      {
        messageId: 'm2',
        conversationId: 'conv-1',
        sender: 'AI',
        text: 'Уточните размер',
        createdAt: '2026-08-12T10:00:02.000Z',
      },
      {
        messageId: 'm3',
        conversationId: 'conv-1',
        sender: 'HUMAN',
        text: 'Мы уже замерили — 900 на 2100',
        createdAt: '2026-08-12T10:00:03.000Z',
      },
    ]);

    const llm = new FakeLlmProvider('Тестовый ответ Jarvis');
    const orchestrator = new ConversationOrchestrator(store, llm);

    await orchestrator.handleIncomingMessage({
      conversationId: 'conv-1',
      messageId: 'm4',
      text: 'Сколько будет стоить?',
      createdAt: '2026-08-12T10:00:04.000Z',
    });

    expect(llm.requests[0]?.messages).toEqual([
      { role: 'user', content: 'Нужна сетка на дверь' },
      { role: 'assistant', content: 'Уточните размер' },
      { role: 'assistant', content: 'Мы уже замерили — 900 на 2100' },
      { role: 'user', content: 'Сколько будет стоить?' },
    ]);
  });
});
