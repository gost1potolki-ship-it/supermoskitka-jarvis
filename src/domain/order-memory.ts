import type { OrderChange } from './order-change.js';
import type { OrderItem } from './order-item.js';
import type { CustomerFacts, FulfillmentFacts } from './order-sections.js';

export interface OrderMemory {
  orderId: string;
  conversationId: string;
  items: OrderItem[];
  changes: OrderChange[];
  /** Optional customer facts (Task 09). */
  customer?: CustomerFacts;
  /** Optional fulfillment semantics (Task 09). No monetary fields. */
  fulfillment?: FulfillmentFacts;
  createdAt: string;
  updatedAt: string;
}

export function getOrderItem(memory: OrderMemory, orderItemId: string): OrderItem | undefined {
  return memory.items.find((item) => item.id === orderItemId);
}
