import { getFactValue, type OrderMemory } from '../../domain/index.js';

import {
  resolvePreliminaryInputs,
  type ResolvedPreliminaryItemInput,
} from './preliminary-input.js';

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

export function buildQuoteFingerprintInputFromMemory(memory: OrderMemory): QuoteFingerprintInput {
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
    fulfillment: {
      installationRequested: getFactValue(memory.fulfillment?.installationRequested),
      pickupRequested: getFactValue(memory.fulfillment?.pickupRequested),
      deliveryRequested: getFactValue(memory.fulfillment?.deliveryRequested),
      deliveryType: getFactValue(memory.fulfillment?.deliveryType),
      deliveryKm: getFactValue(memory.fulfillment?.deliveryKm),
    },
  };
}

export function computeQuoteInputFingerprint(input: QuoteFingerprintInput): string {
  return JSON.stringify(stableValue(input));
}

export function computeQuoteInputFingerprintFromMemory(memory: OrderMemory): string {
  return computeQuoteInputFingerprint(buildQuoteFingerprintInputFromMemory(memory));
}
