export type LeadReadinessStatus = 'NOT_READY' | 'READY_FOR_MEASUREMENT';

export type LeadReadinessCode =
  | 'NEEDS_INPUT'
  | 'NEEDS_SIZE_BASIS'
  | 'PRODUCT_MISSING'
  | 'PRICE_NOT_ACCEPTED'
  | 'MEASUREMENT_NOT_AGREED'
  | 'QUOTE_MISSING'
  | 'QUOTE_STALE'
  | 'PRICING_POLICY_INCOMPLETE'
  | 'CONTACT_MISSING'
  | 'ADDRESS_MISSING';

export interface LeadReadiness {
  status: LeadReadinessStatus;
  blockingCodes: LeadReadinessCode[];
}

export type MeasurementActionPolicy = 'AUTO_WHEN_READY' | 'ALWAYS_MANUAL' | 'DISABLED';

export type MeasurementActionDecision =
  | 'AUTO_ALLOWED'
  | 'NOT_READY'
  | 'AWAITING_OWNER_APPROVAL';
