import type { CalculationItemInput } from '../../calculation/index.js';
import { CURRENT_BUSINESS_RULES } from '../../calculation/business-rules.js';
import {
  calculateFrameBomCost,
  MISSING_COST_REASON,
  type ActualCostMeshType,
  type ActualCostProfileColor,
} from '../../calculation/actual-cost/index.js';
import { getFactValue, type OrderMemory } from '../../domain/index.js';

import type { TrustedPreliminaryCalculationInput } from './trusted-preliminary-calculation.js';
import {
  CITY_DELIVERY_DIRECT_COST_RUB,
  MEASUREMENT_DIRECT_COST_RUB,
  INSTALLATION_DIRECT_COST_PER_FRAME_RUB,
} from './frame-order-direct-cost.js';

export interface FrameActualOrderCostBreakdown {
  productKnownSubtotalRub: number;
  measurementDirectCostRub: number;
  installationDirectCostRub: number;
  deliveryDirectCostRub: number;
  knownDirectCostSubtotalRub: number;
  missingCostReasons: string[];
}

export interface FrameActualOrderCostInput {
  memory: OrderMemory;
  trustedInput: TrustedPreliminaryCalculationInput;
}

function mapProfileColor(value: string | undefined): ActualCostProfileColor | null {
  if (value === 'WHITE' || value === 'BROWN_8017' || value === 'GRAY_7016') {
    return value;
  }
  return null;
}

function mapMeshType(value: string | undefined): ActualCostMeshType | null {
  if (
    value === 'STANDARD' ||
    value === 'ANTIMOSHKA' ||
    value === 'ANTICAT' ||
    value === 'ANTIDUST'
  ) {
    return value;
  }
  return null;
}

function findTrustedItem(
  trustedInput: TrustedPreliminaryCalculationInput,
  itemId: string,
): CalculationItemInput | undefined {
  return trustedInput.items.find((item) => item.itemId === itemId);
}

/**
 * Known FRAME BOM + confirmed service payouts.
 * Never claims EXACT: hardware/handle/screw quantities are unresolved in V1.
 * Never silently prices FRAME 32 as FRAME 25.
 */
export function computeFrameActualOrderDirectCost(
  input: FrameActualOrderCostInput,
): FrameActualOrderCostBreakdown {
  const { memory, trustedInput } = input;
  const deliveryType = trustedInput.delivery.type;
  const missingCostReasons: string[] = [];

  if (deliveryType === 'out') {
    missingCostReasons.push(MISSING_COST_REASON.REGIONAL_DELIVERY_DIRECT_COST_UNKNOWN);
  }

  let productKnownSubtotalRub = 0;
  let frameQuantity = 0;

  for (const orderItem of memory.items) {
    if (getFactValue(orderItem.productType) !== 'FRAME') {
      continue;
    }

    const trustedItem = findTrustedItem(trustedInput, orderItem.id);
    if (
      !trustedItem ||
      trustedItem.productType !== 'FRAME' ||
      trustedItem.widthMm === undefined ||
      trustedItem.heightMm === undefined
    ) {
      missingCostReasons.push('FRAME_TRUSTED_SIZE_UNAVAILABLE');
      continue;
    }

    const profileColor = mapProfileColor(getFactValue(orderItem.profileColor));
    const meshType = mapMeshType(getFactValue(orderItem.meshType));
    if (!profileColor) {
      if (getFactValue(orderItem.profileColor) === 'CUSTOM_RAL') {
        missingCostReasons.push(MISSING_COST_REASON.FRAME_RAL_PAINTING_ACTUAL_COST_UNKNOWN);
      } else {
        missingCostReasons.push('FRAME_PROFILE_COLOR_ACTUAL_COST_UNKNOWN');
      }
      continue;
    }
    if (!meshType) {
      missingCostReasons.push('FRAME_MESH_ACTUAL_COST_UNKNOWN');
      continue;
    }

    const fastening =
      trustedItem.fastening === 'PLUNGER' ? 'PLUNGER' : 'Z_METAL';

    const bom = calculateFrameBomCost({
      widthMm: trustedItem.widthMm,
      heightMm: trustedItem.heightMm,
      profileColor,
      meshType,
      fastening,
      frameProfile: trustedItem.frameProfile === '32' ? '32' : '25',
      businessRules: CURRENT_BUSINESS_RULES,
    });

    missingCostReasons.push(...bom.missingCostReasons);
    const quantity = trustedItem.quantity ?? 1;
    productKnownSubtotalRub += bom.knownProductDirectCostSubtotalRub * quantity;
    frameQuantity += quantity;
  }

  const isSelfPickup = deliveryType === 'pickup';
  const measurementDirectCostRub = isSelfPickup ? 0 : MEASUREMENT_DIRECT_COST_RUB;
  const deliveryDirectCostRub =
    deliveryType === 'city' ? CITY_DELIVERY_DIRECT_COST_RUB : 0;
  const installationDirectCostRub = isSelfPickup
    ? 0
    : INSTALLATION_DIRECT_COST_PER_FRAME_RUB * frameQuantity;

  const knownDirectCostSubtotalRub =
    productKnownSubtotalRub +
    measurementDirectCostRub +
    deliveryDirectCostRub +
    installationDirectCostRub;

  return {
    productKnownSubtotalRub,
    measurementDirectCostRub,
    installationDirectCostRub,
    deliveryDirectCostRub,
    knownDirectCostSubtotalRub,
    missingCostReasons: [...new Set(missingCostReasons)],
  };
}
