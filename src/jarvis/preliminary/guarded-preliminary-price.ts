import type { CalculationOutcome } from '../../calculation/index.js';
import type { PricingPolicyStatus } from '../../domain/index.js';
import type { OrderMemory } from '../../domain/index.js';
import { applyCommercialPricingPolicy } from '../pricing/commercial-pricing-policy.js';

import { computeFrameActualOrderDirectCost } from './frame-actual-order-cost.js';
import { resolveOrderPricingStrategy } from './product-pricing-strategy.js';
import {
  computeQuoteInputFingerprintFromMemory,
  computeQuoteInputFingerprintFromTrustedCalculation,
} from './quote-fingerprint.js';
import {
  buildTrustedPreliminaryCalculationInput,
  type TrustedPreliminaryCalculationInput,
} from './trusted-preliminary-calculation.js';

export type GuardedPreliminaryPriceCode =
  | 'NEEDS_INPUT'
  | 'NEEDS_SIZE_BASIS'
  | 'DIRECT_COST_BASIS_INCOMPLETE'
  | 'MARGIN_COST_BASIS_UNAVAILABLE'
  | 'CALCULATION_INCOMPLETE';

export interface GuardedPreliminaryPrice {
  publicTotalRub: number;
  pricingPolicyStatus: PricingPolicyStatus;
  inputFingerprint: string;
  calculationVersion?: string;
  priceVersion?: string;
}

export type CreateGuardedPreliminaryPriceResult =
  | { ok: true; guarded: GuardedPreliminaryPrice }
  | { ok: false; code: GuardedPreliminaryPriceCode };

export interface CreateGuardedPreliminaryPriceInput {
  memory: OrderMemory;
  outcome: CalculationOutcome;
  deliveryType: 'city' | 'out' | 'pickup';
}

function buildTrustedInput(
  memory: OrderMemory,
  deliveryType: 'city' | 'out' | 'pickup',
): TrustedPreliminaryCalculationInput | null {
  const built = buildTrustedPreliminaryCalculationInput(memory, { type: deliveryType });
  if (!built.ok) {
    return null;
  }
  return built.input;
}

export function createGuardedPreliminaryPrice(
  input: CreateGuardedPreliminaryPriceInput,
): CreateGuardedPreliminaryPriceResult {
  const { memory, outcome, deliveryType } = input;

  if (outcome.status !== 'calculated' || outcome.total === null) {
    return { ok: false, code: 'CALCULATION_INCOMPLETE' };
  }

  const strategy = resolveOrderPricingStrategy(memory, deliveryType);
  const legacyCommercialTotalRub = outcome.total;

  if (strategy.kind === 'EXISTING_PRODUCT_FORMULA') {
    return {
      ok: true,
      guarded: {
        publicTotalRub: legacyCommercialTotalRub,
        pricingPolicyStatus: 'EXISTING_PRODUCT_FORMULA',
        inputFingerprint: computeQuoteInputFingerprintFromMemory(memory, { deliveryType }),
        calculationVersion: outcome.calculationVersion,
        priceVersion: outcome.priceVersion,
      },
    };
  }

  if (strategy.kind === 'DIRECT_COST_BASIS_INCOMPLETE') {
    return { ok: false, code: 'DIRECT_COST_BASIS_INCOMPLETE' };
  }

  const trustedInput = buildTrustedInput(memory, deliveryType);
  if (!trustedInput) {
    return { ok: false, code: 'DIRECT_COST_BASIS_INCOMPLETE' };
  }

  const inputFingerprint = computeQuoteInputFingerprintFromTrustedCalculation(
    memory,
    trustedInput,
  );

  const actualCost = computeFrameActualOrderDirectCost({ memory, trustedInput });
  if (!actualCost.ok) {
    return { ok: false, code: 'DIRECT_COST_BASIS_INCOMPLETE' };
  }

  const decision = applyCommercialPricingPolicy({
    legacyCommercialTotalRub,
    orderDirectCostRub: actualCost.totalDirectCostRub,
  });

  if (decision.economicsStatus !== 'EXACT') {
    return { ok: false, code: 'DIRECT_COST_BASIS_INCOMPLETE' };
  }

  return {
    ok: true,
    guarded: {
      publicTotalRub: decision.finalCustomerPriceRub,
      pricingPolicyStatus: 'FRAME_COMMERCIAL_PRICING_PASSED',
      inputFingerprint,
      calculationVersion: outcome.calculationVersion,
      priceVersion: outcome.priceVersion,
    },
  };
}
