export const PRICING_POLICY_VERSION = 'jarvis-pricing-policy-v3';

/** Customer-quote trust is independent of internal profitability. */
export type QuoteTrustStatus = 'TRUSTED_LEGACY_CALCULATION';

/**
 * Legacy persisted statuses from Task 11 / 11.1.
 * Codec migrates these to `TRUSTED_LEGACY_CALCULATION`.
 */
export type LegacyPricingPolicyStatus =
  | 'FRAME_COMMERCIAL_PRICING_PASSED'
  | 'FRAME_MARGIN_GUARD_PASSED'
  | 'EXISTING_PRODUCT_FORMULA';

/** @deprecated Use QuoteTrustStatus. Kept for codec migration of old documents. */
export type PricingPolicyStatus = QuoteTrustStatus | LegacyPricingPolicyStatus;

export interface PreliminaryQuoteSnapshot {
  quoteId: string;
  inputFingerprint: string;
  publicTotalRub: number;
  createdAt: string;
  pricingPolicyVersion: string;
  quoteTrustStatus: QuoteTrustStatus;
  calculationVersion?: string;
  priceVersion?: string;
}
