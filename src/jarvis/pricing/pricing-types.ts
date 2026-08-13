export type CalculationMode = 'PRODUCT_ONLY' | 'PRELIMINARY_ALL_IN';

export interface PriceIntegrityContext {
  mode: CalculationMode;
  authoritativeTotal: number;
}

export type PriceIntegrityReason =
  | 'accepted'
  | 'missing_total'
  | 'wrong_total'
  | 'conflicting_amounts';

export interface PriceIntegrityResult {
  accepted: boolean;
  reason: PriceIntegrityReason;
  outgoingText: string;
  candidateText: string;
}
