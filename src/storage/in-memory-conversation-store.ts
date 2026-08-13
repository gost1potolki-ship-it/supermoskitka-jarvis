import type { Conversation } from '../domain/conversation.js';
import {
  ConversationAlreadyExistsError,
  ConversationNotFoundError,
  InvalidOperationError,
  MessageAlreadyExistsError,
  PersistenceConflictError,
} from '../domain/errors.js';
import type { Message } from '../domain/message.js';

import type { ConversationStore } from './conversation-store.js';

function compareMessages(a: Message, b: Message): number {
  const byTime = a.createdAt.localeCompare(b.createdAt);
  if (byTime !== 0) {
    return byTime;
  }
  return a.messageId.localeCompare(b.messageId);
}

export class InMemoryConversationStore implements ConversationStore {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messagesByConversation = new Map<string, Message[]>();
  private readonly messageIds = new Set<string>();

  async createConversation(conversation: Conversation): Promise<Conversation> {
    if (this.conversations.has(conversation.conversationId)) {
      throw new ConversationAlreadyExistsError(conversation.conversationId);
    }

    const stored: Conversation = { ...conversation, revision: 1 };
    this.conversations.set(stored.conversationId, stored);
    this.messagesByConversation.set(stored.conversationId, []);
    return { ...stored };
  }

  async getConversation(conversationId: string): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(conversationId);
    return conversation ? { ...conversation } : undefined;
  }

  async saveConversation(conversation: Conversation): Promise<Conversation> {
    const existing = this.conversations.get(conversation.conversationId);
    if (!existing) {
      throw new ConversationNotFoundError(conversation.conversationId);
    }

    const currentRevision = existing.revision ?? 0;
    if (conversation.revision !== undefined && conversation.revision !== currentRevision) {
      throw new PersistenceConflictError(
        `Conversation revision conflict for ${conversation.conversationId}`,
      );
    }

    const stored: Conversation = {
      ...conversation,
      revision: currentRevision + 1,
    };
    this.conversations.set(stored.conversationId, stored);
    return { ...stored };
  }

  async appendMessage(message: Message): Promise<Message> {
    if (!this.conversations.has(message.conversationId)) {
      throw new ConversationNotFoundError(message.conversationId);
    }

    if (this.messageIds.has(message.messageId)) {
      throw new MessageAlreadyExistsError(message.messageId);
    }

    if (message.text.trim() === '') {
      throw new InvalidOperationError('Message text must not be empty');
    }

    const stored: Message = { ...message };
    const list = this.messagesByConversation.get(message.conversationId);
    if (!list) {
      throw new ConversationNotFoundError(message.conversationId);
    }

    list.push(stored);
    list.sort(compareMessages);
    this.messageIds.add(stored.messageId);

    const conversation = this.conversations.get(message.conversationId);
    if (conversation) {
      this.conversations.set(message.conversationId, {
        ...conversation,
        revision: (conversation.revision ?? 0) + 1,
        updatedAt: message.createdAt,
      });
    }

    return { ...stored };
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    if (!this.conversations.has(conversationId)) {
      throw new ConversationNotFoundError(conversationId);
    }

    const list = this.messagesByConversation.get(conversationId) ?? [];
    return list.map((message) => ({ ...message }));
  }
}
