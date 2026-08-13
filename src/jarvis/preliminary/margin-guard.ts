export const MARGIN_FLOOR = 0.47;

export type MarginGuardCode = 'MARGIN_COST_BASIS_UNAVAILABLE' | 'MARGIN_FLOOR_APPLIED';

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

export function applyMarginGuard(input: ApplyMarginGuardInput): ApplyMarginGuardResult {
  const { publicTotalRub, trustedDirectCostRub } = input;

  if (
    trustedDirectCostRub === undefined ||
    !Number.isFinite(trustedDirectCostRub) ||
    trustedDirectCostRub <= 0
  ) {
    return {
      ok: false,
      publicTotalRub,
      code: 'MARGIN_COST_BASIS_UNAVAILABLE',
    };
  }

  if (publicTotalRub <= 0) {
    return {
      ok: false,
      publicTotalRub,
      code: 'MARGIN_COST_BASIS_UNAVAILABLE',
    };
  }

  const margin = (publicTotalRub - trustedDirectCostRub) / publicTotalRub;
  if (margin >= MARGIN_FLOOR) {
    return {
      ok: true,
      publicTotalRub,
      adjusted: false,
    };
  }

  const guardedTotal = Math.ceil(trustedDirectCostRub / (1 - MARGIN_FLOOR));
  const adjustedTotal = Math.max(publicTotalRub, guardedTotal);

  return {
    ok: true,
    publicTotalRub: adjustedTotal,
    adjusted: adjustedTotal !== publicTotalRub,
    code: adjustedTotal !== publicTotalRub ? 'MARGIN_FLOOR_APPLIED' : undefined,
  };
}
