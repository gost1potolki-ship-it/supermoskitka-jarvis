import type { OrderChange } from './order-change.js';
import type { OrderItem } from './order-item.js';

export interface OrderMemory {
  orderId: string;
  conversationId: string;
  items: OrderItem[];
  changes: OrderChange[];
  createdAt: string;
  updatedAt: string;
}

export function getOrderItem(memory: OrderMemory, orderItemId: string): OrderItem | undefined {
  return memory.items.find((item) => item.id === orderItemId);
}
