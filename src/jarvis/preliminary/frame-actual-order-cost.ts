import type { CalculationItemInput } from '../../calculation/index.js';
import { CURRENT_BUSINESS_RULES } from '../../calculation/business-rules.js';
import {
  calculateFrameBomCost,
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

export type FrameActualOrderCostCode = 'DIRECT_COST_BASIS_INCOMPLETE';

export interface FrameActualOrderCostBreakdown {
  productDirectCostRub: number;
  measurementDirectCostRub: number;
  installationDirectCostRub: number;
  deliveryDirectCostRub: number;
  totalDirectCostRub: number;
}

export type FrameActualOrderCostResult =
  | ({ ok: true } & FrameActualOrderCostBreakdown)
  | { ok: false; code: FrameActualOrderCostCode };

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

export function computeFrameActualOrderDirectCost(
  input: FrameActualOrderCostInput,
): FrameActualOrderCostResult {
  const { memory, trustedInput } = input;
  const deliveryType = trustedInput.delivery.type;

  if (deliveryType === 'out') {
    return { ok: false, code: 'DIRECT_COST_BASIS_INCOMPLETE' };
  }

  let productDirectCostRub = 0;
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
      return { ok: false, code: 'DIRECT_COST_BASIS_INCOMPLETE' };
    }

    const profileColor = mapProfileColor(getFactValue(orderItem.profileColor));
    const meshType = mapMeshType(getFactValue(orderItem.meshType));
    if (!profileColor || !meshType) {
      return { ok: false, code: 'DIRECT_COST_BASIS_INCOMPLETE' };
    }

    const fastening =
      trustedItem.productType === 'FRAME' && trustedItem.fastening === 'PLUNGER'
        ? 'PLUNGER'
        : 'Z_METAL';

    const bom = calculateFrameBomCost({
      widthMm: trustedItem.widthMm,
      heightMm: trustedItem.heightMm,
      profileColor,
      meshType,
      fastening,
      frameProfile:
        trustedItem.productType === 'FRAME' && trustedItem.frameProfile === '32' ? '32' : '25',
      businessRules: CURRENT_BUSINESS_RULES,
    });

    const quantity = trustedItem.quantity ?? 1;
    productDirectCostRub += bom.totalProductDirectCostRub * quantity;
    frameQuantity += quantity;
  }

  if (frameQuantity === 0 || productDirectCostRub <= 0) {
    return { ok: false, code: 'DIRECT_COST_BASIS_INCOMPLETE' };
  }

  const isSelfPickup = deliveryType === 'pickup';
  const measurementDirectCostRub = isSelfPickup ? 0 : MEASUREMENT_DIRECT_COST_RUB;
  const deliveryDirectCostRub =
    deliveryType === 'city' ? CITY_DELIVERY_DIRECT_COST_RUB : 0;
  const installationDirectCostRub = isSelfPickup
    ? 0
    : INSTALLATION_DIRECT_COST_PER_FRAME_RUB * frameQuantity;

  const totalDirectCostRub =
    productDirectCostRub +
    measurementDirectCostRub +
    deliveryDirectCostRub +
    installationDirectCostRub;

  return {
    ok: true,
    productDirectCostRub,
    measurementDirectCostRub,
    installationDirectCostRub,
    deliveryDirectCostRub,
    totalDirectCostRub,
  };
}
