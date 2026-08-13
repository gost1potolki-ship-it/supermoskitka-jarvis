export {
  ESTIMATED_AVERAGE_HEIGHT_MM,
  ESTIMATED_AVERAGE_WIDTH_MM,
  LIGHT_OPENING_MARGIN_MM,
  resolveItemCalculationSize,
  resolvePreliminaryInputs,
  type PreliminarySizeSource,
  type ResolvedPreliminaryItemInput,
  type ResolvedPreliminarySize,
  type ResolvePreliminaryInputsResult,
} from './preliminary-input.js';

export {
  buildQuoteFingerprintInputFromMemory,
  buildQuoteFingerprintInputFromTrustedCalculation,
  computeQuoteInputFingerprint,
  computeQuoteInputFingerprintFromMemory,
  computeQuoteInputFingerprintFromTrustedCalculation,
  type QuoteFingerprintInput,
} from './quote-fingerprint.js';

export {
  MARGIN_FLOOR,
  applyMarginGuard,
  type ApplyMarginGuardInput,
  type ApplyMarginGuardResult,
  type MarginGuardCode,
} from './margin-guard.js';

export {
  attachPreliminaryQuote,
  buildPreliminaryQuoteSnapshot,
  createQuoteAfterPreliminaryCalculation,
  createUniquePreliminaryQuoteId,
  generatePreliminaryQuoteId,
  type BuildPreliminaryQuoteSnapshotInput,
  type CreateQuoteAfterPreliminaryCalculationInput,
} from './preliminary-quote.js';

export { evaluateLeadReadiness } from './lead-readiness.js';

export {
  DEFAULT_MEASUREMENT_ACTION_POLICY,
  decideMeasurementAction,
} from './measurement-action-policy.js';

export {
  buildMeasurementDraft,
  type MeasurementDraft,
  type MeasurementDraftItem,
} from './measurement-draft.js';

export { PreliminaryQuoteService } from './preliminary-quote-service.js';

export {
  buildCalculationRequestFromTrustedPreliminaryInput,
  buildTrustedPreliminaryCalculationInput,
  llmDimensionsConflictWithTrusted,
  type TrustedPreliminaryBuildCode,
  type TrustedPreliminaryBuildResult,
  type TrustedPreliminaryCalculationInput,
} from './trusted-preliminary-calculation.js';

export { mapMemoryItemToCalculationItemInput } from './memory-to-calculation-item.js';

export {
  CITY_DELIVERY_DIRECT_COST_RUB,
  INSTALLATION_DIRECT_COST_PER_FRAME_RUB,
  MEASUREMENT_DIRECT_COST_RUB,
  computeFrameOrderDirectCost,
  type FrameOrderDirectCostBreakdown,
  type FrameOrderDirectCostInput,
  type FrameOrderDirectCostResult,
} from './frame-order-direct-cost.js';

export {
  computeFrameActualOrderDirectCost,
  type FrameActualOrderCostBreakdown,
  type FrameActualOrderCostInput,
} from './frame-actual-order-cost.js';

export {
  resolveOrderPricingStrategy,
  type ProductPricingStrategy,
  type ProductPricingStrategyKind,
} from './product-pricing-strategy.js';

export {
  TrustedPreliminaryQuoteProof,
  attachProfitabilityToMemory,
  createGuardedPreliminaryPrice,
  createTrustedPreliminaryQuoteProof,
  isTrustedPreliminaryQuoteProof,
  type CreateTrustedPreliminaryQuoteInput,
  type CreateTrustedPreliminaryQuoteResult,
  type TrustedPreliminaryQuoteFailureCode,
} from './guarded-preliminary-price.js';

export {
  computeOrderProfitabilitySnapshot,
  finalizeFrameOrderProfitability,
  type ComputeOrderProfitabilitySnapshotInput,
  type FinalizeFrameOrderProfitabilityInput,
} from './order-profitability.js';
