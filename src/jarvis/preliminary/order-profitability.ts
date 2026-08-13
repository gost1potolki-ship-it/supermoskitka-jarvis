import { getFactValue, type OrderMemory } from '../../domain/index.js';
import { MISSING_COST_REASON } from '../../calculation/actual-cost/actual-cost-catalog-v1.js';
import type { OrderProfitabilitySnapshot } from '../../domain/profitability.js';
import { computeOrderProfitability } from '../pricing/profitability-analytics.js';

import { computeFrameActualOrderDirectCost } from './frame-actual-order-cost.js';
import {
  buildTrustedPreliminaryCalculationInput,
  type TrustedPreliminaryCalculationInput,
} from './trusted-preliminary-calculation.js';

export interface ComputeOrderProfitabilitySnapshotInput {
  memory: OrderMemory;
  sellingTotalRub: number;
  deliveryType?: 'city' | 'out' | 'pickup';
  trustedInput?: TrustedPreliminaryCalculationInput;
  computedAt?: string;
}

export interface FinalizeFrameOrderProfitabilityInput {
  sellingTotalRub: number;
  knownDirectCostSubtotalRub: number;
  missingCostReasons: string[];
  computedAt?: string;
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

function itemProductTypes(memory: OrderMemory): string[] {
  return memory.items
    .map((item) => getFactValue(item.productType))
    .filter((value): value is string => value !== undefined);
}

/**
 * Orchestration decision: EXACT only when missing reasons are empty and known subtotal > 0.
 * Incomplete FRAME (e.g. hardware) correctly stays PARTIAL until owner confirms full basis.
 */
export function finalizeFrameOrderProfitability(
  input: FinalizeFrameOrderProfitabilityInput,
): OrderProfitabilitySnapshot {
  const computedAt = input.computedAt ?? new Date().toISOString();
  const missing = uniqueReasons(input.missingCostReasons);

  if (missing.length === 0 && input.knownDirectCostSubtotalRub > 0) {
    return computeOrderProfitability({
      sellingTotalRub: input.sellingTotalRub,
      costBasisStatus: 'EXACT',
      actualDirectCostRub: input.knownDirectCostSubtotalRub,
      knownDirectCostSubtotalRub: input.knownDirectCostSubtotalRub,
      computedAt,
    });
  }

  return computeOrderProfitability({
    sellingTotalRub: input.sellingTotalRub,
    costBasisStatus: 'PARTIAL',
    knownDirectCostSubtotalRub: input.knownDirectCostSubtotalRub,
    missingCostReasons: missing.length > 0 ? missing : ['DIRECT_COST_BASIS_INCOMPLETE'],
    computedAt,
  });
}

/**
 * Internal analytics. Incomplete actual cost never blocks a customer quote.
 */
export function computeOrderProfitabilitySnapshot(
  input: ComputeOrderProfitabilitySnapshotInput,
): OrderProfitabilitySnapshot {
  const computedAt = input.computedAt ?? new Date().toISOString();
  const productTypes = itemProductTypes(input.memory);
  const unique = new Set(productTypes);
  const allFrame = unique.size === 1 && unique.has('FRAME');
  const missing: string[] = [];

  const deliveryType =
    input.deliveryType ??
    (getFactValue(input.memory.fulfillment?.deliveryType) as
      | 'city'
      | 'out'
      | 'pickup'
      | undefined);

  if (unique.has('WING')) {
    missing.push(MISSING_COST_REASON.WING_ACTUAL_COST_UNKNOWN);
  }
  if (unique.has('DOOR')) {
    missing.push(MISSING_COST_REASON.DOOR_ACTUAL_COST_UNKNOWN);
  }
  if (unique.has('PLISSE_NET')) {
    missing.push(MISSING_COST_REASON.PLISSE_ACTUAL_COST_UNKNOWN);
  }
  if (unique.size > 1) {
    missing.push(MISSING_COST_REASON.MIXED_ORDER_COMMON_COST_UNALLOCATED);
  }
  if (deliveryType === 'out') {
    missing.push(MISSING_COST_REASON.REGIONAL_DELIVERY_DIRECT_COST_UNKNOWN);
  }

  for (const item of input.memory.items) {
    if (getFactValue(item.profileColor) === 'CUSTOM_RAL') {
      missing.push(MISSING_COST_REASON.FRAME_RAL_PAINTING_ACTUAL_COST_UNKNOWN);
    }
    if (getFactValue(item.profileType) === '32') {
      missing.push(MISSING_COST_REASON.FRAME_PROFILE_32_ACTUAL_COST_UNKNOWN);
    }
  }

  if (!allFrame) {
    return computeOrderProfitability({
      sellingTotalRub: input.sellingTotalRub,
      costBasisStatus: 'UNAVAILABLE',
      missingCostReasons: uniqueReasons(
        missing.length > 0 ? missing : ['ACTUAL_COST_MODEL_UNAVAILABLE'],
      ),
      computedAt,
    });
  }

  const trustedInput =
    input.trustedInput ??
    (() => {
      const built = buildTrustedPreliminaryCalculationInput(
        input.memory,
        deliveryType ? { type: deliveryType } : undefined,
      );
      return built.ok ? built.input : undefined;
    })();

  if (!trustedInput) {
    return computeOrderProfitability({
      sellingTotalRub: input.sellingTotalRub,
      costBasisStatus: 'UNAVAILABLE',
      missingCostReasons: uniqueReasons(
        missing.length > 0 ? missing : ['TRUSTED_COST_INPUT_UNAVAILABLE'],
      ),
      computedAt,
    });
  }

  const actual = computeFrameActualOrderDirectCost({
    memory: input.memory,
    trustedInput,
  });

  missing.push(...actual.missingCostReasons);

  return finalizeFrameOrderProfitability({
    sellingTotalRub: input.sellingTotalRub,
    knownDirectCostSubtotalRub: actual.knownDirectCostSubtotalRub,
    missingCostReasons: missing,
    computedAt,
  });
}
