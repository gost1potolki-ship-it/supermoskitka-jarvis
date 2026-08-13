import {
  HARD_GROSS_MARGIN_FLOOR,
  NORMAL_GROSS_MARGIN_TARGET,
  PSYCH_TARGET_BELOW_THRESHOLD_RUB,
  PSYCH_THRESHOLD_STEP_RUB,
  PSYCH_WINDOW_ABOVE_THRESHOLD_RUB,
} from '../../calculation/actual-cost/actual-cost-config.js';

export type EconomicsStatus = 'EXACT' | 'PARTIAL' | 'UNAVAILABLE';

export interface TrustedPricingDecision {
  legacyCommercialTotalRub: number;
  orderDirectCostRub?: number;
  economicsStatus: EconomicsStatus;
  targetPrice50Rub?: number;
  hardFloor47Rub?: number;
  rawCommercialPriceRub: number;
  finalCustomerPriceRub: number;
  psychologicalAdjustmentRub: number;
  pricingPolicyStatus: string;
}

export interface ApplyCommercialPricingInput {
  legacyCommercialTotalRub: number;
  orderDirectCostRub: number;
}

function grossMargin(price: number, directCost: number): number {
  if (price <= 0) {
    return 0;
  }
  return (price - directCost) / price;
}

export function computeTargetPrice50Rub(orderDirectCostRub: number): number {
  return Math.ceil(orderDirectCostRub / NORMAL_GROSS_MARGIN_TARGET);
}

export function computeHardFloor47Rub(orderDirectCostRub: number): number {
  return Math.ceil(orderDirectCostRub / (1 - HARD_GROSS_MARGIN_FLOOR));
}

export function computeRawCommercialPriceRub(
  legacyCommercialTotalRub: number,
  targetPrice50Rub: number,
): number {
  return Math.max(legacyCommercialTotalRub, targetPrice50Rub);
}

export function applyPsychologicalPricing(
  rawPriceRub: number,
  orderDirectCostRub: number,
): { finalPriceRub: number; adjustmentRub: number } {
  const hardFloor = computeHardFloor47Rub(orderDirectCostRub);
  const threshold = Math.floor(rawPriceRub / PSYCH_THRESHOLD_STEP_RUB) * PSYCH_THRESHOLD_STEP_RUB;

  if (threshold <= 0) {
    return { finalPriceRub: rawPriceRub, adjustmentRub: 0 };
  }

  if (
    rawPriceRub >= threshold &&
    rawPriceRub <= threshold + PSYCH_WINDOW_ABOVE_THRESHOLD_RUB
  ) {
    const candidate = threshold - PSYCH_TARGET_BELOW_THRESHOLD_RUB;
    if (candidate >= hardFloor && grossMargin(candidate, orderDirectCostRub) >= HARD_GROSS_MARGIN_FLOOR) {
      return { finalPriceRub: candidate, adjustmentRub: candidate - rawPriceRub };
    }
  }

  return { finalPriceRub: rawPriceRub, adjustmentRub: 0 };
}

/**
 * Trusted commercial pricing for FRAME orders.
 * Legacy selling price is preserved when higher than 50% target.
 */
export function applyCommercialPricingPolicy(
  input: ApplyCommercialPricingInput,
): TrustedPricingDecision {
  const { legacyCommercialTotalRub, orderDirectCostRub } = input;

  if (orderDirectCostRub <= 0 || !Number.isFinite(orderDirectCostRub)) {
    return {
      legacyCommercialTotalRub,
      economicsStatus: 'UNAVAILABLE',
      rawCommercialPriceRub: legacyCommercialTotalRub,
      finalCustomerPriceRub: legacyCommercialTotalRub,
      psychologicalAdjustmentRub: 0,
      pricingPolicyStatus: 'DIRECT_COST_BASIS_INCOMPLETE',
    };
  }

  const targetPrice50Rub = computeTargetPrice50Rub(orderDirectCostRub);
  const hardFloor47Rub = computeHardFloor47Rub(orderDirectCostRub);
  const rawCommercialPriceRub = computeRawCommercialPriceRub(
    legacyCommercialTotalRub,
    targetPrice50Rub,
  );
  const afterFloor = Math.max(rawCommercialPriceRub, hardFloor47Rub);
  const psych = applyPsychologicalPricing(afterFloor, orderDirectCostRub);
  const finalCustomerPriceRub = Math.max(psych.finalPriceRub, hardFloor47Rub);

  return {
    legacyCommercialTotalRub,
    orderDirectCostRub,
    economicsStatus: 'EXACT',
    targetPrice50Rub,
    hardFloor47Rub,
    rawCommercialPriceRub,
    finalCustomerPriceRub,
    psychologicalAdjustmentRub: psych.adjustmentRub,
    pricingPolicyStatus: 'FRAME_COMMERCIAL_PRICING_PASSED',
  };
}
