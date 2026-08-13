import type { OrderMemory } from '../../domain/index.js';

import { computeFrameActualOrderDirectCost } from './frame-actual-order-cost.js';
import {
  buildTrustedPreliminaryCalculationInput,
  type TrustedPreliminaryCalculationInput,
} from './trusted-preliminary-calculation.js';

export const MEASUREMENT_DIRECT_COST_RUB = 1000;
export const INSTALLATION_DIRECT_COST_PER_FRAME_RUB = 500;
export const CITY_DELIVERY_DIRECT_COST_RUB = 1000;

export type FrameDirectCostCode = 'DIRECT_COST_BASIS_INCOMPLETE';

export interface FrameOrderDirectCostBreakdown {
  productDirectCostRub: number;
  measurementDirectCostRub: number;
  installationDirectCostRub: number;
  deliveryDirectCostRub: number;
  totalDirectCostRub: number;
}

export interface FrameOrderDirectCostInput {
  memory: OrderMemory;
  deliveryType: 'city' | 'out' | 'pickup';
  trustedInput?: TrustedPreliminaryCalculationInput;
}

export type FrameOrderDirectCostResult =
  | ({ ok: true } & FrameOrderDirectCostBreakdown)
  | { ok: false; code: FrameDirectCostCode };

/**
 * Order direct cost from Actual Cost Catalog (FRAME BOM + service direct costs).
 * Does not use legacy selling engine directCost fields.
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
    return { ok: false, code: 'DIRECT_COST_BASIS_INCOMPLETE' };
  }

  return computeFrameActualOrderDirectCost({
    memory: input.memory,
    trustedInput,
  });
}
