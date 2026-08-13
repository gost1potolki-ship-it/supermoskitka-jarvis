import type { OrderMemory } from '../domain/index.js';

export interface OrderMemoryStore {
  get(conversationId: string): Promise<OrderMemory | null>;
  /** Persists memory; returns stored memory including updated revision. */
  save(memory: OrderMemory): Promise<OrderMemory>;
}
