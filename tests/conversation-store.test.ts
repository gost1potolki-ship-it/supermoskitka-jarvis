import type { Conversation } from '../src/domain/conversation.js';
import type { Message } from '../src/domain/message.js';
import {
  ConversationAlreadyExistsError,
  ConversationNotFoundError,
  MessageAlreadyExistsError,
} from '../src/domain/errors.js';
import { InMemoryConversationStore } from '../src/storage/index.js';
import { describe, expect, it } from 'vitest';

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    conversationId: 'conv-1',
    channel: 'telegram',
    customerId: 'customer-1',
    mode: 'AI',
    createdAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

function message(overrides: Partial<Message> & Pick<Message, 'messageId' | 'conversationId'>): Message {
  return {
    channel: 'telegram',
    sender: 'CUSTOMER',
    text: 'hello',
    createdAt: '2026-08-12T10:00:01.000Z',
    ...overrides,
  };
}

describe('InMemoryConversationStore', () => {
  it('creates a conversation and returns it', async () => {
    const store = new InMemoryConversationStore();
    const created = await store.createConversation(conversation());
    const loaded = await store.getConversation('conv-1');

    expect(created.conversationId).toBe('conv-1');
    expect(loaded).toEqual(created);
  });

  it('rejects duplicate conversationId', async () => {
    const store = new InMemoryConversationStore();
    await store.createConversation(conversation());

    await expect(store.createConversation(conversation())).rejects.toBeInstanceOf(
      ConversationAlreadyExistsError,
    );
  });

  it('returns messages in chronological order', async () => {
    const store = new InMemoryConversationStore();
    await store.createConversation(conversation());

    await store.appendMessage(
      message({
        messageId: 'msg-2',
        conversationId: 'conv-1',
        text: 'second',
        createdAt: '2026-08-12T10:00:02.000Z',
      }),
    );
    await store.appendMessage(
      message({
        messageId: 'msg-1',
        conversationId: 'conv-1',
        text: 'first',
        createdAt: '2026-08-12T10:00:01.000Z',
      }),
    );
    await store.appendMessage(
      message({
        messageId: 'msg-3',
        conversationId: 'conv-1',
        text: 'third',
        createdAt: '2026-08-12T10:00:03.000Z',
      }),
    );

    const messages = await store.getMessages('conv-1');
    expect(messages.map((item) => item.messageId)).toEqual(['msg-1', 'msg-2', 'msg-3']);
  });

  it('isolates messages between conversations', async () => {
    const store = new InMemoryConversationStore();
    await store.createConversation(conversation({ conversationId: 'conv-a' }));
    await store.createConversation(conversation({ conversationId: 'conv-b' }));

    await store.appendMessage(
      message({
        messageId: 'msg-a',
        conversationId: 'conv-a',
        text: 'from A',
      }),
    );
    await store.appendMessage(
      message({
        messageId: 'msg-b',
        conversationId: 'conv-b',
        text: 'from B',
      }),
    );

    const messagesA = await store.getMessages('conv-a');
    const messagesB = await store.getMessages('conv-b');

    expect(messagesA.map((item) => item.messageId)).toEqual(['msg-a']);
    expect(messagesB.map((item) => item.messageId)).toEqual(['msg-b']);
  });

  it('rejects duplicate messageId', async () => {
    const store = new InMemoryConversationStore();
    await store.createConversation(conversation());
    await store.appendMessage(message({ messageId: 'msg-1', conversationId: 'conv-1' }));

    await expect(
      store.appendMessage(message({ messageId: 'msg-1', conversationId: 'conv-1', text: 'again' })),
    ).rejects.toBeInstanceOf(MessageAlreadyExistsError);
  });

  it('rejects message for unknown conversationId', async () => {
    const store = new InMemoryConversationStore();

    await expect(
      store.appendMessage(message({ messageId: 'msg-1', conversationId: 'missing' })),
    ).rejects.toBeInstanceOf(ConversationNotFoundError);
  });

  it('persists conversation mode changes', async () => {
    const store = new InMemoryConversationStore();
    const created = await store.createConversation(conversation({ mode: 'AI' }));

    await store.saveConversation(
      conversation({
        mode: 'HUMAN',
        revision: created.revision,
        updatedAt: '2026-08-12T11:00:00.000Z',
      }),
    );

    const loaded = await store.getConversation('conv-1');
    expect(loaded?.mode).toBe('HUMAN');
    expect(loaded?.updatedAt).toBe('2026-08-12T11:00:00.000Z');
  });

  it('returns undefined for unknown conversation', async () => {
    const store = new InMemoryConversationStore();
    await expect(store.getConversation('missing')).resolves.toBeUndefined();
  });
});
