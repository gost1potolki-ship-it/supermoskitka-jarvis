export type { Channel } from './channel.js';
export { CHANNELS } from './channel.js';

export type { Conversation, ConversationMode } from './conversation.js';

export type { Customer } from './customer.js';

export type { Fact, FactSource, FactVersion } from './fact.js';
export { createFact, getFactValue } from './fact.js';

export type { OrderChange, OrderChangeType } from './order-change.js';

export type {
  OrderItem,
  OrderItemFactField,
  OrderItemFactValue,
  OrderItemFacts,
} from './order-item.js';
export { ORDER_ITEM_FACT_FIELDS, createEmptyOrderItem } from './order-item.js';

export type { OrderMemory } from './order-memory.js';
export { getOrderItem } from './order-memory.js';
