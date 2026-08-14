export type { Channel } from './channel.js';
export { CHANNELS } from './channel.js';

export type { Conversation, ConversationMode } from './conversation.js';

export type { Customer } from './customer.js';

export {
  ConversationAlreadyExistsError,
  ConversationNotFoundError,
  InvalidOperationError,
  MessageAlreadyExistsError,
  PersistenceConfigError,
  PersistenceConflictError,
  PersistenceDataError,
  PersistenceSizeLimitError,
} from './errors.js';

export type { Fact, FactSource, FactVersion } from './fact.js';
export { createFact, getFactValue } from './fact.js';

export type { Message, MessageSender } from './message.js';

export type { OrderChange, OrderChangeType } from './order-change.js';

export type {
  MeasurementBasis,
  OrderItem,
  OrderItemFactField,
  OrderItemFactValue,
  OrderItemFacts,
} from './order-item.js';
export {
  MEASUREMENT_BASIS_VALUES,
  ORDER_ITEM_FACT_FIELDS,
  createEmptyOrderItem,
} from './order-item.js';

export type { OrderMemory } from './order-memory.js';
export { getOrderItem } from './order-memory.js';

export type {
  CommercialFactField,
  CommercialFacts,
  CommercialFactValue,
  CustomerFactField,
  CustomerFacts,
  CustomerFactValue,
  FulfillmentFactField,
  FulfillmentFacts,
  FulfillmentFactValue,
} from './order-sections.js';
export {
  COMMERCIAL_FACT_FIELDS,
  CUSTOMER_FACT_FIELDS,
  FULFILLMENT_FACT_FIELDS,
} from './order-sections.js';

export type {
  LegacyPricingPolicyStatus,
  PreliminaryQuoteSnapshot,
  PricingPolicyStatus,
  QuoteTrustStatus,
} from './preliminary-quote.js';
export { PRICING_POLICY_VERSION } from './preliminary-quote.js';

export type {
  CostBasisStatus,
  OrderProfitabilitySnapshot,
  ProfitabilityBand,
} from './profitability.js';

export type {
  LeadReadiness,
  LeadReadinessCode,
  LeadReadinessStatus,
  MeasurementActionDecision,
  MeasurementActionPolicy,
} from './lead-readiness.js';

export type {
  MeasurementPayerType,
  MeasurementSheetSyncStatus,
  MeasurementSubmissionSource,
  MeasurementSubmissionV1,
  UpcomingMeasurementRecord,
} from './measurement-submission.js';

export {
  DEFAULT_MEASURER_PAYER,
  DEFAULT_MEASURER_PAYOUT_RUB,
  assertMeasurementFinancialPayload,
  buildMeasurementFinancials,
  formatMeasurerPayerText,
  parseMeasurerPayerText,
} from './measurement-financials.js';
export type {
  MeasurementFinancialInput,
  MeasurementFinancialProjection,
} from './measurement-financials.js';
