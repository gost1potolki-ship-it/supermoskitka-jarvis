import type {
  CalculationItemInput,
  CalculationProductType,
  CalculationRequest,
  DeliveryInput,
} from './calculation-types.js';

const SUPPORTED = new Set<CalculationProductType>(['FRAME', 'WING', 'DOOR', 'PLISSE_NET']);

const CUSTOMER_TYPES = new Set(['retail', 'dealer', 'corporate']);
const MESH_TYPES = new Set(['STANDARD', 'ANTIMOSHKA', 'ANTICAT', 'ANTIDUST']);
const COLOR_KINDS = new Set(['WHITE', 'BROWN_8017', 'GRAY_7016', 'CUSTOM_RAL']);
const COLOR_FINISHES = new Set(['STANDARD', 'MATTE', 'GLOSS', 'MUAR']);
const FRAME_PROFILES = new Set(['25', '32']);
const FRAME_FASTENINGS = new Set(['Z_METAL', 'PLUNGER']);
const CORNER_TYPES = new Set(['PLASTIC', 'ALUMINUM']);
const HANDLE_TYPES = new Set(['PLASTIC', 'METAL']);
const WING_FASTENINGS = new Set(['WING_FLAGS']);
const DOOR_PROFILES = new Set(['32', '42']);
const OPENING_TYPES = new Set(['SIDE', 'COUNTER', 'UP']);
const THRESHOLD_TYPES = new Set(['STANDARD', 'LOW', 'REINFORCED']);
const DELIVERY_TYPES = new Set(['city', 'out', 'pickup']);
const PAYMENT_METHODS = new Set(['cash', 'qr']);
const DISCOUNT_PERCENTS = new Set([0, 5, 10]);

export function isSupportedProductType(value: string): value is CalculationProductType {
  return SUPPORTED.has(value as CalculationProductType);
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

function pushInvalid(target: string[], field: string, ok: boolean): void {
  if (!ok && !target.includes(field)) {
    target.push(field);
  }
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

/** Runtime enum/value checks for JSON callers (LLM/adapters). Fail closed — no silent defaults. */
export function collectInvalidEnumFields(item: CalculationItemInput): string[] {
  const prefix = `items[${item.itemId}]`;
  const invalid: string[] = [];

  pushInvalid(invalid, `${prefix}.productType`, isSupportedProductType(String(item.productType)));

  if (item.meshType !== undefined) {
    pushInvalid(invalid, `${prefix}.meshType`, MESH_TYPES.has(String(item.meshType)));
  }

  if (item.color !== undefined) {
    const kind = (item.color as { kind?: unknown }).kind;
    pushInvalid(invalid, `${prefix}.color.kind`, COLOR_KINDS.has(String(kind)));
    if (kind === 'CUSTOM_RAL') {
      const finish = (item.color as { finish?: unknown }).finish;
      if (finish !== undefined) {
        pushInvalid(invalid, `${prefix}.color.finish`, COLOR_FINISHES.has(String(finish)));
      }
    }
  }

  if (item.productType === 'FRAME') {
    if (item.frameProfile !== undefined) {
      pushInvalid(invalid, `${prefix}.frameProfile`, FRAME_PROFILES.has(String(item.frameProfile)));
    }
    if (item.fastening !== undefined) {
      pushInvalid(invalid, `${prefix}.fastening`, FRAME_FASTENINGS.has(String(item.fastening)));
    }
    if (item.cornerType !== undefined) {
      pushInvalid(invalid, `${prefix}.cornerType`, CORNER_TYPES.has(String(item.cornerType)));
    }
    if (item.handleType !== undefined) {
      pushInvalid(invalid, `${prefix}.handleType`, HANDLE_TYPES.has(String(item.handleType)));
    }
  }

  if (item.productType === 'WING' && item.fastening !== undefined) {
    pushInvalid(invalid, `${prefix}.fastening`, WING_FASTENINGS.has(String(item.fastening)));
  }

  if (item.productType === 'DOOR' && item.doorProfile !== undefined) {
    pushInvalid(invalid, `${prefix}.doorProfile`, DOOR_PROFILES.has(String(item.doorProfile)));
  }

  if (item.productType === 'PLISSE_NET') {
    if (item.openingType !== undefined) {
      pushInvalid(invalid, `${prefix}.openingType`, OPENING_TYPES.has(String(item.openingType)));
    }
    if (item.thresholdType !== undefined) {
      pushInvalid(
        invalid,
        `${prefix}.thresholdType`,
        THRESHOLD_TYPES.has(String(item.thresholdType)),
      );
    }
  }

  return invalid;
}

export function collectDeliveryValidationFields(
  delivery: DeliveryInput | undefined,
): string[] {
  if (!delivery) {
    return [];
  }

  const invalid: string[] = [];
  pushInvalid(invalid, 'delivery.type', DELIVERY_TYPES.has(String(delivery.type)));

  if (delivery.type === 'out') {
    const value = delivery.distanceKm;
    if (value === undefined) {
      invalid.push('delivery.distanceKm');
    } else if (!Number.isFinite(value) || value <= 0) {
      invalid.push('delivery.distanceKm');
    }
  }

  return invalid;
}

export function collectRequestValidationFields(request: CalculationRequest): string[] {
  const invalid: string[] = [];

  pushInvalid(
    invalid,
    'customerType',
    CUSTOMER_TYPES.has(String(request.customerType)),
  );

  invalid.push(...collectDeliveryValidationFields(request.delivery));

  if (request.payment !== undefined) {
    pushInvalid(
      invalid,
      'payment.method',
      PAYMENT_METHODS.has(String(request.payment.method)),
    );
  }

  if (request.discount !== undefined) {
    pushInvalid(
      invalid,
      'discount.percent',
      DISCOUNT_PERCENTS.has(request.discount.percent as number),
    );
  }

  return invalid;
}

/**
 * Door 32mm profile exists in catalog, but dedicated 32mm door hardware
 * (handles/hinges/corners) does not. Refuse silent substitution of 42mm SKUs.
 */
export function isDoor32CurrentPricingGap(item: CalculationItemInput): boolean {
  return item.productType === 'DOOR' && item.doorProfile === '32';
}

export const DOOR_32_PRICING_GAP_WARNING =
  'DOOR profile 32: CURRENT_PRICING_GAP — dedicated 32mm door hardware prices are absent; refusing silent use of 42mm handle/hinge/corner lines';
