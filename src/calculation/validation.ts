import type { CalculationItemInput, CalculationProductType } from './calculation-types.js';

const SUPPORTED = new Set<CalculationProductType>(['FRAME', 'WING', 'DOOR', 'PLISSE_NET']);

export function isSupportedProductType(value: string): value is CalculationProductType {
  return SUPPORTED.has(value as CalculationProductType);
}

export function validatePositiveNumber(value: number | undefined, field: string): string | null {
  if (value === undefined) {
    return field;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return field;
  }
  return null;
}

export function collectMissingFields(item: CalculationItemInput): string[] {
  const prefix = `items[${item.itemId}]`;
  const missing: string[] = [];

  const push = (field: string, value: unknown, required = true) => {
    if (!required) {
      return;
    }
    if (value === undefined || value === null || value === '') {
      missing.push(`${prefix}.${field}`);
    }
  };

  push('widthMm', item.widthMm);
  push('heightMm', item.heightMm);
  push('quantity', item.quantity);
  push('color', item.color);
  push('meshType', item.meshType);

  if (item.productType === 'FRAME') {
    push('fastening', item.fastening);
    push('frameProfile', item.frameProfile);
  }

  if (item.productType === 'WING') {
    push('fastening', item.fastening);
  }

  if (item.productType === 'DOOR') {
    push('fastening', item.fastening);
    push('doorProfile', item.doorProfile);
    push('hingesCount', item.hingesCount);
    push('hasLatch', item.hasLatch);
  }

  if (item.productType === 'PLISSE_NET') {
    push('openingType', item.openingType);
    push('thresholdType', item.thresholdType);
    push('handlesCount', item.handlesCount);
  }

  for (const field of ['widthMm', 'heightMm', 'quantity'] as const) {
    const invalid = validatePositiveNumber(item[field], `${prefix}.${field}`);
    if (invalid && item[field] !== undefined) {
      // Keep as missing/invalid marker for needs_input; caller treats non-positive as validation failure.
      if (!missing.includes(invalid)) {
        missing.push(invalid);
      }
    }
  }

  return missing;
}

export function collectInvalidNumericFields(item: CalculationItemInput): string[] {
  const prefix = `items[${item.itemId}]`;
  const invalid: string[] = [];
  for (const field of ['widthMm', 'heightMm', 'quantity'] as const) {
    const value = item[field];
    if (value === undefined) {
      continue;
    }
    if (!Number.isFinite(value) || value <= 0) {
      invalid.push(`${prefix}.${field}`);
    }
  }
  if (item.hingesCount !== undefined && (!Number.isFinite(item.hingesCount) || item.hingesCount <= 0)) {
    invalid.push(`${prefix}.hingesCount`);
  }
  if (
    item.handlesCount !== undefined &&
    (!Number.isFinite(item.handlesCount) || item.handlesCount <= 0)
  ) {
    invalid.push(`${prefix}.handlesCount`);
  }
  return invalid;
}
