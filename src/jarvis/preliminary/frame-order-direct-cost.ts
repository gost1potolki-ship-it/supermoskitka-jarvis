import type { CostBasisStatus } from '../../domain/index.js';
import type { OrderMemory } from '../../domain/index.js';

import { computeFrameActualOrderDirectCost } from './frame-actual-order-cost.js';
import {
  buildTrustedPreliminaryCalculationInput,
  type TrustedPreliminaryCalculationInput,
} from './trusted-preliminary-calculation.js';

export const MEASUREMENT_DIRECT_COST_RUB = 1000;
export const INSTALLATION_DIRECT_COST_PER_FRAME_RUB = 500;
export const CITY_DELIVERY_DIRECT_COST_RUB = 1000;

export interface FrameOrderDirectCostBreakdown {
  costBasisStatus: Extract<CostBasisStatus, 'EXACT' | 'PARTIAL'>;
  productKnownSubtotalRub: number;
  measurementDirectCostRub: number;
  installationDirectCostRub: number;
  deliveryDirectCostRub: number;
  knownDirectCostSubtotalRub: number;
  /** Present only when costBasisStatus === 'EXACT'. */
  actualDirectCostRub?: number;
  missingCostReasons: string[];
}

export interface FrameOrderDirectCostInput {
  memory: OrderMemory;
  deliveryType: 'city' | 'out' | 'pickup';
  trustedInput?: TrustedPreliminaryCalculationInput;
}

export type FrameOrderDirectCostResult =
  | ({ ok: true } & FrameOrderDirectCostBreakdown)
  | { ok: false; code: 'DIRECT_COST_BASIS_INCOMPLETE'; missingCostReasons: string[] };

/**
 * FRAME order direct-cost analytics.
 * PARTIAL: knownDirectCostSubtotalRub only (never aliased as exact total).
 * EXACT: actualDirectCostRub present when missing reasons are empty.
 */
export function computeFrameOrderDirectCost(
  input: FrameOrderDirectCostInput,
): FrameOrderDirectCostResult {
  const trustedInput =
    input.trustedInput ??
    (() => {
      const built = buildTrustedPreliminaryCalculationInput(input.memory, {
        type: input.deliveryType,
      });
      return built.ok ? built.input : undefined;
    })();

  if (!trustedInput) {
    return {
      ok: false,
      code: 'DIRECT_COST_BASIS_INCOMPLETE',
      missingCostReasons: ['TRUSTED_COST_INPUT_UNAVAILABLE'],
    };
  }

  const actual = computeFrameActualOrderDirectCost({
    memory: input.memory,
    trustedInput,
  });

  const missingCostReasons = [...actual.missingCostReasons];
  const isExact =
    missingCostReasons.length === 0 && actual.knownDirectCostSubtotalRub > 0;

  return {
    ok: true,
    costBasisStatus: isExact ? 'EXACT' : 'PARTIAL',
    productKnownSubtotalRub: actual.productKnownSubtotalRub,
    measurementDirectCostRub: actual.measurementDirectCostRub,
    installationDirectCostRub: actual.installationDirectCostRub,
    deliveryDirectCostRub: actual.deliveryDirectCostRub,
    knownDirectCostSubtotalRub: actual.knownDirectCostSubtotalRub,
    ...(isExact ? { actualDirectCostRub: actual.knownDirectCostSubtotalRub } : {}),
    missingCostReasons,
  };
}
