import { PersistenceConflictError, type OrderMemory } from '../domain/index.js';

import type { OrderMemoryStore } from './order-memory-store.js';

export class InMemoryOrderMemoryStore implements OrderMemoryStore {
  private readonly byConversation = new Map<string, OrderMemory>();

  async get(conversationId: string): Promise<OrderMemory | null> {
    const memory = this.byConversation.get(conversationId);
    return memory ? structuredClone(memory) : null;
  }

  async save(memory: OrderMemory): Promise<OrderMemory> {
    const existing = this.byConversation.get(memory.conversationId);
    const expected = memory.revision;
    if (!existing) {
      if (expected !== undefined && expected !== 0) {
        throw new PersistenceConflictError(
          `OrderMemory revision conflict for ${memory.conversationId}`,
        );
      }
      const stored = { ...structuredClone(memory), revision: 1 };
      this.byConversation.set(memory.conversationId, stored);
      return structuredClone(stored);
    }

    const currentRevision = existing.revision ?? 0;
    if (expected !== undefined && expected !== currentRevision) {
      throw new PersistenceConflictError(
        `OrderMemory revision conflict for ${memory.conversationId}`,
      );
    }
    const stored = {
      ...structuredClone(memory),
      revision: currentRevision + 1,
    };
    this.byConversation.set(memory.conversationId, stored);
    return structuredClone(stored);
  }
}
