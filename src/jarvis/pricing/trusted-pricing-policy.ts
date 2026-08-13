import type {
  CalculationCustomerType,
  CalculationItemInput,
  CalculationRequest,
} from '../../calculation/index.js';

import type { CalculationMode } from './pricing-types.js';
import { parseTrustedCalculationItem } from './trusted-item-parser.js';
import type { SafeToolResult } from '../tools/tool-types.js';

/** Facts LLM may extract — no raw monetary authority. */
export interface TrustedCalculationToolInput {
  mode: CalculationMode;
  customerType: CalculationCustomerType;
  items: CalculationItemInput[];
  delivery?: {
    type: 'city' | 'out' | 'pickup';
    distanceKm?: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reject(message = 'Calculation arguments are invalid.'): {
  ok: false;
  result: SafeToolResult;
} {
  return {
    ok: false,
    result: {
      status: 'invalid_arguments',
      message,
    },
  };
}

/**
 * Strict parse of AI-facing calculate_order arguments.
 * Unknown / monetary authority fields → invalid_arguments.
 */
export function parseTrustedCalculationToolInput(
  argumentsJson: string,
): { ok: true; input: TrustedCalculationToolInput } | { ok: false; result: SafeToolResult } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argumentsJson);
  } catch {
    return reject();
  }

  if (!isRecord(parsed)) {
    return reject();
  }

  const allowedRoot = new Set(['mode', 'customerType', 'items', 'delivery']);
  for (const key of Object.keys(parsed)) {
    if (!allowedRoot.has(key)) {
      return reject(`Unknown field: ${key}`);
    }
  }

  const mode = parsed.mode;
  if (mode !== 'PRODUCT_ONLY' && mode !== 'PRELIMINARY_ALL_IN') {
    return reject('Invalid or missing mode.');
  }

  const customerType = parsed.customerType;
  if (
    customerType !== 'retail' &&
    customerType !== 'dealer' &&
    customerType !== 'corporate'
  ) {
    return reject('Invalid or missing customerType.');
  }

  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    return reject();
  }

  const items: CalculationItemInput[] = [];
  for (let index = 0; index < parsed.items.length; index += 1) {
    const parsedItem = parseTrustedCalculationItem(parsed.items[index], `items[${index}]`);
    if (!parsedItem.ok) {
      return reject(parsedItem.error);
    }
    items.push(parsedItem.item);
  }

  let delivery: TrustedCalculationToolInput['delivery'];
  if (parsed.delivery !== undefined) {
    if (!isRecord(parsed.delivery)) {
      return reject();
    }
    const deliveryKeys = Object.keys(parsed.delivery);
    for (const key of deliveryKeys) {
      if (key !== 'type' && key !== 'distanceKm') {
        return reject(`Unknown field: delivery.${key}`);
      }
    }
    const type = parsed.delivery.type;
    if (type !== 'city' && type !== 'out' && type !== 'pickup') {
      return reject('Invalid delivery.type.');
    }
    if (
      parsed.delivery.distanceKm !== undefined &&
      (typeof parsed.delivery.distanceKm !== 'number' ||
        !Number.isFinite(parsed.delivery.distanceKm))
    ) {
      return reject('Invalid delivery.distanceKm.');
    }
    delivery = {
      type,
      ...(typeof parsed.delivery.distanceKm === 'number'
        ? { distanceKm: parsed.delivery.distanceKm }
        : {}),
    };
  }

  return {
    ok: true,
    input: {
      mode,
      customerType,
      items,
      ...(delivery !== undefined ? { delivery } : {}),
    },
  };
}

export type TrustedPolicyBuildResult =
  | { ok: true; request: CalculationRequest }
  | { ok: false; result: SafeToolResult };

/**
 * Server-side policy: semantic mode + trusted facts → CalculationRequest.
 * Never accepts LLM-controlled money fields.
 */
export function buildCalculationRequestFromTrustedInput(
  input: TrustedCalculationToolInput,
): TrustedPolicyBuildResult {
  if (input.mode === 'PRODUCT_ONLY') {
    return {
      ok: true,
      request: {
        customerType: input.customerType,
        items: input.items,
        delivery: { type: 'pickup' },
        installation: { enabled: false },
        measurement: { includeFee: false },
        discount: { percent: 0 },
        payment: { method: 'cash' },
      },
    };
  }

  // PRELIMINARY_ALL_IN
  if (!input.delivery?.type) {
    return {
      ok: false,
      result: {
        status: 'needs_input',
        missingFields: ['delivery.type'],
        warnings: [],
        message:
          'Missing required fields for PRELIMINARY_ALL_IN. Ask the customer for missingFields. Do not invent values or prices.',
      },
    };
  }

  if (input.delivery.type === 'out' && !(typeof input.delivery.distanceKm === 'number')) {
    return {
      ok: false,
      result: {
        status: 'needs_input',
        missingFields: ['delivery.distanceKm'],
        warnings: [],
        message:
          'Missing required fields for PRELIMINARY_ALL_IN. Ask the customer for missingFields. Do not invent values or prices.',
      },
    };
  }

  return {
    ok: true,
    request: {
      customerType: input.customerType,
      items: input.items,
      delivery: {
        type: input.delivery.type,
        ...(input.delivery.type === 'out'
          ? { distanceKm: input.delivery.distanceKm }
          : {}),
      },
      installation: { enabled: true },
      measurement: { includeFee: true },
      discount: { percent: 0 },
      payment: { method: 'cash' },
    },
  };
}
