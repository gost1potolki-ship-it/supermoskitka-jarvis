export const PRICING_POLICY_VERSION = 'jarvis-pricing-policy-v2';

export type PricingPolicyStatus =
  | 'FRAME_COMMERCIAL_PRICING_PASSED'
  | 'FRAME_MARGIN_GUARD_PASSED'
  | 'EXISTING_PRODUCT_FORMULA';

export interface PreliminaryQuoteSnapshot {
  quoteId: string;
  inputFingerprint: string;
  publicTotalRub: number;
  createdAt: string;
  pricingPolicyVersion: string;
  pricingPolicyStatus: PricingPolicyStatus;
  calculationVersion?: string;
  priceVersion?: string;
}
