export type CalculationMode = 'PRODUCT_ONLY' | 'PRELIMINARY_ALL_IN';

export interface PriceIntegrityContext {
  mode: CalculationMode;
  authoritativeTotal: number;
}

export type CalculationTurnState =
  | { kind: 'none' }
  | { kind: 'calculated'; total: number; mode: CalculationMode }
  | { kind: 'needs_input' }
  | { kind: 'unsupported' }
  | { kind: 'failed' };

export type PriceIntegrityReason =
  | 'accepted'
  | 'missing_total'
  | 'wrong_total'
  | 'conflicting_amounts'
  | 'price_not_allowed';

export interface PriceIntegrityResult {
  accepted: boolean;
  reason: PriceIntegrityReason;
  outgoingText: string;
  candidateText: string;
}
