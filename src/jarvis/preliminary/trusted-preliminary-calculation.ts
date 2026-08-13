import type {
  CalculationCustomerType,
  CalculationItemInput,
  CalculationRequest,
} from '../../calculation/index.js';
import { getFactValue, type OrderMemory } from '../../domain/index.js';
import type { TrustedCalculationToolInput } from '../pricing/trusted-pricing-policy.js';

import { mapMemoryItemToCalculationItemInput } from './memory-to-calculation-item.js';
import { resolvePreliminaryInputs } from './preliminary-input.js';

export interface TrustedPreliminaryCalculationInput {
  customerType: CalculationCustomerType;
  items: CalculationItemInput[];
  delivery: {
    type: 'city' | 'out' | 'pickup';
    distanceKm?: number;
  };
}

export type TrustedPreliminaryBuildCode =
  | 'NEEDS_INPUT'
  | 'NEEDS_SIZE_BASIS'
  | 'INCOMPLETE_ORDER_FACTS';

export type TrustedPreliminaryBuildResult =
  | { ok: true; input: TrustedPreliminaryCalculationInput }
  | { ok: false; code: TrustedPreliminaryBuildCode; missingFields?: string[] };

function resolveCustomerType(memory: OrderMemory): CalculationCustomerType {
  const customerType = getFactValue(memory.customer?.customerType);
  if (
    customerType === 'dealer' ||
    customerType === 'corporate' ||
    customerType === 'retail'
  ) {
    return customerType;
  }
  return 'retail';
}

function resolveDelivery(
  memory: OrderMemory,
  llmDelivery?: TrustedCalculationToolInput['delivery'],
): TrustedPreliminaryCalculationInput['delivery'] | null {
  const memoryType = getFactValue(memory.fulfillment?.deliveryType);
  if (memoryType === 'city' || memoryType === 'pickup') {
    return { type: memoryType };
  }
  if (memoryType === 'out') {
    const km = getFactValue(memory.fulfillment?.deliveryKm);
    if (typeof km === 'number' && Number.isFinite(km)) {
      return { type: 'out', distanceKm: km };
    }
    return null;
  }

  if (getFactValue(memory.fulfillment?.pickupRequested) === true) {
    return { type: 'pickup' };
  }

  if (llmDelivery?.type) {
    return llmDelivery;
  }

  return null;
}

export function buildTrustedPreliminaryCalculationInput(
  memory: OrderMemory,
  llmDelivery?: TrustedCalculationToolInput['delivery'],
): TrustedPreliminaryBuildResult {
  const resolved = resolvePreliminaryInputs(memory);
  if (resolved.blocking.includes('NEEDS_INPUT')) {
    return { ok: false, code: 'NEEDS_INPUT' };
  }
  if (resolved.blocking.includes('NEEDS_SIZE_BASIS')) {
    return { ok: false, code: 'NEEDS_SIZE_BASIS' };
  }

  const items: CalculationItemInput[] = [];
  for (const resolvedItem of resolved.items) {
    const orderItem = memory.items.find((item) => item.id === resolvedItem.itemId);
    if (!orderItem) {
      return { ok: false, code: 'INCOMPLETE_ORDER_FACTS' };
    }
    const mapped = mapMemoryItemToCalculationItemInput(orderItem, resolvedItem);
    if (!mapped) {
      return { ok: false, code: 'INCOMPLETE_ORDER_FACTS' };
    }
    items.push(mapped);
  }

  if (items.length === 0) {
    return { ok: false, code: 'INCOMPLETE_ORDER_FACTS' };
  }

  const delivery = resolveDelivery(memory, llmDelivery);
  if (!delivery) {
    return {
      ok: false,
      code: 'NEEDS_INPUT',
      missingFields: ['delivery.type'],
    };
  }

  if (delivery.type === 'out' && delivery.distanceKm === undefined) {
    return {
      ok: false,
      code: 'NEEDS_INPUT',
      missingFields: ['delivery.distanceKm'],
    };
  }

  return {
    ok: true,
    input: {
      customerType: resolveCustomerType(memory),
      items,
      delivery,
    },
  };
}

export function buildCalculationRequestFromTrustedPreliminaryInput(
  input: TrustedPreliminaryCalculationInput,
): CalculationRequest {
  const isPickup = input.delivery.type === 'pickup';
  return {
    customerType: input.customerType,
    items: input.items,
    delivery: {
      type: input.delivery.type,
      ...(input.delivery.type === 'out'
        ? { distanceKm: input.delivery.distanceKm }
        : {}),
    },
    installation: { enabled: !isPickup },
    measurement: { includeFee: !isPickup },
    discount: { percent: 0 },
    payment: { method: 'cash' },
  };
}

export function llmDimensionsConflictWithTrusted(
  memory: OrderMemory,
  llmItems: CalculationItemInput[],
): boolean {
  const trusted = buildTrustedPreliminaryCalculationInput(memory);
  if (!trusted.ok) {
    return false;
  }

  for (const trustedItem of trusted.input.items) {
    const llmItem = llmItems.find((item) => item.itemId === trustedItem.itemId);
    if (!llmItem) {
      continue;
    }
    if (
      llmItem.widthMm !== undefined &&
      trustedItem.widthMm !== undefined &&
      llmItem.widthMm !== trustedItem.widthMm
    ) {
      return true;
    }
    if (
      llmItem.heightMm !== undefined &&
      trustedItem.heightMm !== undefined &&
      llmItem.heightMm !== trustedItem.heightMm
    ) {
      return true;
    }
  }

  return false;
}
