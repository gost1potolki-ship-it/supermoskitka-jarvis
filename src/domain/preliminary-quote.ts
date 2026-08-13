export const PRICING_POLICY_VERSION = 'jarvis-pricing-policy-v1';

export interface PreliminaryQuoteSnapshot {
  quoteId: string;
  inputFingerprint: string;
  publicTotalRub: number;
  createdAt: string;
  pricingPolicyVersion: string;
  marginGuardPassed: true;
  calculationVersion?: string;
  priceVersion?: string;
}
