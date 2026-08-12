import type {
  CalculationItemInput,
  CalculationProductType,
  CalculationRequest,
  DeliveryInput,
} from './calculation-types.js';

const SUPPORTED = new Set<CalculationProductType>(['FRAME', 'WING', 'DOOR', 'PLISSE_NET']);

export function isSupportedProductType(value: string): value is CalculationProductType {
  return SUPPORTED.has(value as CalculationProductType);
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

export function collectMissingFields(item: CalculationItemInput): string[] {
  const prefix = `items[${item.itemId}]`;
  const missing: string[] = [];

  const push = (field: string, value: unknown) => {
    if (value === undefined || value === null || value === '') {
      missing.push(`${prefix}.${field}`);
    }
  };

  push('widthMm', item.widthMm);
  push('heightMm', item.heightMm);
  push('quantity', item.quantity);
  push('meshType', item.meshType);
  push('color', item.color);

  if (item.color?.kind === 'CUSTOM_RAL') {
    push('color.ral', item.color.ral);
  }

  if (item.productType === 'FRAME') {
    push('fastening', item.fastening);
    push('frameProfile', item.frameProfile);
    push('cornerType', item.cornerType);
    push('handleType', item.handleType);
  }

  if (item.productType === 'DOOR') {
    push('doorProfile', item.doorProfile);
    push('hingesCount', item.hingesCount);
  }

  if (item.productType === 'PLISSE_NET') {
    push('openingType', item.openingType);
    push('thresholdType', item.thresholdType);
    push('handlesCount', item.handlesCount);
  }

  return missing;
}

export function collectInvalidNumericFields(item: CalculationItemInput): string[] {
  const prefix = `items[${item.itemId}]`;
  const invalid: string[] = [];

  if (item.widthMm !== undefined && !isPositiveFinite(item.widthMm)) {
    invalid.push(`${prefix}.widthMm`);
  }
  if (item.heightMm !== undefined && !isPositiveFinite(item.heightMm)) {
    invalid.push(`${prefix}.heightMm`);
  }
  if (item.quantity !== undefined && !isPositiveInteger(item.quantity)) {
    invalid.push(`${prefix}.quantity`);
  }

  if (item.productType === 'DOOR' && item.hingesCount !== undefined) {
    if (item.hingesCount !== 2 && item.hingesCount !== 3) {
      invalid.push(`${prefix}.hingesCount`);
    }
  }

  if (item.productType === 'PLISSE_NET' && item.handlesCount !== undefined) {
    if (!isPositiveInteger(item.handlesCount)) {
      invalid.push(`${prefix}.handlesCount`);
    }
  }

  return invalid;
}

export function collectDeliveryValidationFields(
  delivery: DeliveryInput | undefined,
): string[] {
  if (!delivery || delivery.type !== 'out') {
    return [];
  }

  const value = delivery.distanceKm;
  if (value === undefined) {
    return ['delivery.distanceKm'];
  }
  if (!Number.isFinite(value) || value <= 0) {
    return ['delivery.distanceKm'];
  }
  return [];
}

export function collectRequestValidationFields(request: CalculationRequest): string[] {
  return collectDeliveryValidationFields(request.delivery);
}
