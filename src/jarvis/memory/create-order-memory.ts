import { createEmptyOrderItem, type OrderItem, type OrderMemory } from '../../domain/index.js';

export interface CreateOrderMemoryInput {
  orderId: string;
  conversationId: string;
  itemIds?: string[];
  now?: string;
}

export function createOrderMemory(input: CreateOrderMemoryInput): OrderMemory {
  const now = input.now ?? new Date().toISOString();
  const items: OrderItem[] = (input.itemIds ?? []).map((id) => createEmptyOrderItem(id));

  return {
    orderId: input.orderId,
    conversationId: input.conversationId,
    items,
    changes: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addOrderItem(
  memory: OrderMemory,
  orderItemId: string,
  now: string = new Date().toISOString(),
): OrderMemory {
  if (memory.items.some((item) => item.id === orderItemId)) {
    throw new Error(`Order item already exists: ${orderItemId}`);
  }

  return {
    ...memory,
    items: [...memory.items, createEmptyOrderItem(orderItemId)],
    updatedAt: now,
  };
}
