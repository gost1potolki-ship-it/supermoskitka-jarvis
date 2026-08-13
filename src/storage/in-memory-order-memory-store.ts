import type { OrderMemory } from '../domain/index.js';

import type { OrderMemoryStore } from './order-memory-store.js';

export class InMemoryOrderMemoryStore implements OrderMemoryStore {
  private readonly byConversation = new Map<string, OrderMemory>();

  async get(conversationId: string): Promise<OrderMemory | null> {
    return this.byConversation.get(conversationId) ?? null;
  }

  async save(memory: OrderMemory): Promise<void> {
    this.byConversation.set(memory.conversationId, structuredClone(memory));
  }
}
