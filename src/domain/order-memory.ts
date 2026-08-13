import type { OrderChange } from './order-change.js';
import type { OrderItem } from './order-item.js';
import type { CommercialFacts, CustomerFacts, FulfillmentFacts } from './order-sections.js';
import type { OrderProfitabilitySnapshot } from './profitability.js';
import type { PreliminaryQuoteSnapshot } from './preliminary-quote.js';

export interface OrderMemory {
  orderId: string;
  conversationId: string;
  items: OrderItem[];
  changes: OrderChange[];
  /** Optional customer facts (Task 09). */
  customer?: CustomerFacts;
  /** Optional fulfillment semantics (Task 09). No monetary fields. */
  fulfillment?: FulfillmentFacts;
  /** Optional commercial consent facts (Task 11). No monetary authority. */
  commercial?: CommercialFacts;
  /** Last trusted preliminary quote snapshot (system-generated). */
  preliminaryQuote?: PreliminaryQuoteSnapshot;
  /** Internal owner-only economics. Never serialized into customer LLM context. */
  orderProfitability?: OrderProfitabilitySnapshot;
  /** Bound when the customer explicitly accepts the current non-stale quote. */
  acceptedPreliminaryQuoteId?: string;
  createdAt: string;
  updatedAt: string;
  /** Persistence revision (Task 10). Undefined until first save. */
  revision?: number;
}

export function getOrderItem(memory: OrderMemory, orderItemId: string): OrderItem | undefined {
  return memory.items.find((item) => item.id === orderItemId);
}
