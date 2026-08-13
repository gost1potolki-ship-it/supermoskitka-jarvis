export const MARGIN_FLOOR = 0.47;

export type MarginGuardCode = 'MARGIN_COST_BASIS_UNAVAILABLE';

export interface ApplyMarginGuardInput {
  publicTotalRub: number;
  trustedDirectCostRub?: number;
}

export interface ApplyMarginGuardResult {
  ok: boolean;
  publicTotalRub: number;
  adjusted?: boolean;
  code?: MarginGuardCode;
}

/**
 * Analytics-era leftover: never mutates customer selling price.
 * Incomplete cost does not fail the quote path.
 */
export function applyMarginGuard(input: ApplyMarginGuardInput): ApplyMarginGuardResult {
  return {
    ok: true,
    publicTotalRub: input.publicTotalRub,
    adjusted: false,
    ...(input.trustedDirectCostRub === undefined ||
    !Number.isFinite(input.trustedDirectCostRub) ||
    input.trustedDirectCostRub <= 0
      ? { code: 'MARGIN_COST_BASIS_UNAVAILABLE' }
      : {}),
  };
}
