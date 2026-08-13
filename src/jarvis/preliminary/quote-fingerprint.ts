import { getFactValue, type OrderMemory } from '../../domain/index.js';

import {
  resolvePreliminaryInputs,
  type ResolvedPreliminaryItemInput,
} from './preliminary-input.js';
import type { TrustedPreliminaryCalculationInput } from './trusted-preliminary-calculation.js';

export interface QuoteFingerprintInput {
  items: readonly ResolvedPreliminaryItemInput[];
  customer?: {
    address?: string;
    district?: string;
  };
  fulfillment?: {
    installationRequested?: boolean;
    pickupRequested?: boolean;
    deliveryRequested?: boolean;
    deliveryType?: string;
    deliveryKm?: number;
  };
}

function stableValue(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = stableValue(record[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalPreliminaryFulfillment(
  memory: OrderMemory,
  deliveryType?: 'city' | 'out' | 'pickup',
): QuoteFingerprintInput['fulfillment'] {
  const resolvedType =
    deliveryType ??
    (getFactValue(memory.fulfillment?.deliveryType) as 'city' | 'out' | 'pickup' | undefined) ??
    (getFactValue(memory.fulfillment?.pickupRequested) === true ? 'pickup' : undefined);

  if (resolvedType === 'pickup') {
    return {
      pickupRequested: true,
      deliveryType: 'pickup',
    };
  }

  if (resolvedType === 'city') {
    return {
      deliveryRequested: true,
      installationRequested: true,
      deliveryType: 'city',
    };
  }

  if (resolvedType === 'out') {
    return {
      deliveryRequested: true,
      installationRequested: true,
      deliveryType: 'out',
      deliveryKm: getFactValue(memory.fulfillment?.deliveryKm),
    };
  }

  return {
    installationRequested: getFactValue(memory.fulfillment?.installationRequested),
    pickupRequested: getFactValue(memory.fulfillment?.pickupRequested),
    deliveryRequested: getFactValue(memory.fulfillment?.deliveryRequested),
    deliveryType: getFactValue(memory.fulfillment?.deliveryType),
    deliveryKm: getFactValue(memory.fulfillment?.deliveryKm),
  };
}

export function buildQuoteFingerprintInputFromMemory(
  memory: OrderMemory,
  options?: { deliveryType?: 'city' | 'out' | 'pickup' },
): QuoteFingerprintInput {
  const resolved = resolvePreliminaryInputs(memory);
  return {
    items: resolved.items.map((item) => ({
      ...item,
      size: {
        source: item.size.source,
        ...(item.size.widthMm !== undefined ? { widthMm: item.size.widthMm } : {}),
        ...(item.size.heightMm !== undefined ? { heightMm: item.size.heightMm } : {}),
      },
    })),
    customer: {
      address: getFactValue(memory.customer?.address),
    },
    fulfillment: canonicalPreliminaryFulfillment(memory, options?.deliveryType),
  };
}

export function buildQuoteFingerprintInputFromTrustedCalculation(
  memory: OrderMemory,
  trustedInput: TrustedPreliminaryCalculationInput,
): QuoteFingerprintInput {
  const resolved = resolvePreliminaryInputs(memory);
  const items = trustedInput.items.map((calcItem) => {
    const resolvedItem = resolved.items.find((item) => item.itemId === calcItem.itemId);
    const sizeSource = resolvedItem?.size.source ?? 'ESTIMATED_AVERAGE';
    const base: ResolvedPreliminaryItemInput = {
      itemId: calcItem.itemId,
      productType: calcItem.productType,
      quantity: calcItem.quantity ?? 1,
      size: {
        source: sizeSource,
        widthMm: calcItem.widthMm,
        heightMm: calcItem.heightMm,
      },
      meshType: calcItem.meshType,
      profileColor: resolvedItem?.profileColor,
      profileType:
        calcItem.productType === 'FRAME' ? calcItem.frameProfile : resolvedItem?.profileType,
      fastening:
        calcItem.productType === 'FRAME'
          ? calcItem.fastening
          : calcItem.productType === 'WING'
            ? calcItem.fastening
            : resolvedItem?.fastening,
      openingType:
        calcItem.productType === 'PLISSE_NET' ? calcItem.openingType : resolvedItem?.openingType,
    };
    return base;
  });

  return {
    items,
    customer: {
      address: getFactValue(memory.customer?.address),
    },
    fulfillment: canonicalPreliminaryFulfillment(memory, trustedInput.delivery.type),
  };
}

export function computeQuoteInputFingerprint(input: QuoteFingerprintInput): string {
  return JSON.stringify(stableValue(input));
}

export function computeQuoteInputFingerprintFromTrustedCalculation(
  memory: OrderMemory,
  trustedInput: TrustedPreliminaryCalculationInput,
): string {
  return computeQuoteInputFingerprint(
    buildQuoteFingerprintInputFromTrustedCalculation(memory, trustedInput),
  );
}

export function computeQuoteInputFingerprintFromMemory(
  memory: OrderMemory,
  options?: { deliveryType?: 'city' | 'out' | 'pickup' },
): string {
  return computeQuoteInputFingerprint(buildQuoteFingerprintInputFromMemory(memory, options));
}
