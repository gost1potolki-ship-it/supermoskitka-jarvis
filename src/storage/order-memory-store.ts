import type { OrderMemory } from '../domain/index.js';

export interface OrderMemoryStore {
  get(conversationId: string): Promise<OrderMemory | null>;
  save(memory: OrderMemory): Promise<void>;
}
