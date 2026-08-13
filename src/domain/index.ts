export type { Channel } from './channel.js';
export { CHANNELS } from './channel.js';

export type { Conversation, ConversationMode } from './conversation.js';

export type { Customer } from './customer.js';

export {
  ConversationAlreadyExistsError,
  ConversationNotFoundError,
  InvalidOperationError,
  MessageAlreadyExistsError,
} from './errors.js';

export type { Fact, FactSource, FactVersion } from './fact.js';
export { createFact, getFactValue } from './fact.js';

export type { Message, MessageSender } from './message.js';

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

export type {
  CustomerFactField,
  CustomerFacts,
  CustomerFactValue,
  FulfillmentFactField,
  FulfillmentFacts,
  FulfillmentFactValue,
} from './order-sections.js';
export {
  CUSTOMER_FACT_FIELDS,
  FULFILLMENT_FACT_FIELDS,
} from './order-sections.js';
