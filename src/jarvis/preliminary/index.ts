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
  computeQuoteInputFingerprint,
  computeQuoteInputFingerprintFromMemory,
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
