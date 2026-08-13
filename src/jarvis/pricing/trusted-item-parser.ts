import type {
  CalculationColor,
  CalculationItemInput,
  CalculationProductType,
} from '../../calculation/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownField(path: string, key: string): string {
  return `Unknown field: ${path}.${key}`;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): string | null {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      return unknownField(path, key);
    }
  }
  return null;
}

function optionalNumber(value: unknown, path: string): { ok: true; value?: number } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, error: `Invalid ${path}` };
  }
  return { ok: true, value };
}

function optionalInteger(value: unknown, path: string): { ok: true; value?: number } | { ok: false; error: string } {
  const parsed = optionalNumber(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.value !== undefined && !Number.isInteger(parsed.value)) {
    return { ok: false, error: `Invalid ${path}` };
  }
  return parsed;
}

function parseColor(
  value: unknown,
  path: string,
): { ok: true; color: CalculationColor } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: `Invalid ${path}` };
  }

  const kind = value.kind;
  if (kind === 'WHITE' || kind === 'BROWN_8017' || kind === 'GRAY_7016') {
    const keys = assertOnlyKeys(value, new Set(['kind']), path);
    if (keys) {
      return { ok: false, error: keys };
    }
    return { ok: true, color: { kind } };
  }

  if (kind === 'CUSTOM_RAL') {
    const keys = assertOnlyKeys(value, new Set(['kind', 'ral', 'finish']), path);
    if (keys) {
      return { ok: false, error: keys };
    }
    if (typeof value.ral !== 'string' || value.ral.trim() === '') {
      return { ok: false, error: `Invalid ${path}.ral` };
    }
    const finish = value.finish;
    if (
      finish !== undefined &&
      finish !== 'STANDARD' &&
      finish !== 'MATTE' &&
      finish !== 'GLOSS' &&
      finish !== 'MUAR'
    ) {
      return { ok: false, error: `Invalid ${path}.finish` };
    }
    return {
      ok: true,
      color: {
        kind: 'CUSTOM_RAL',
        ral: value.ral,
        ...(finish !== undefined
          ? { finish: finish as 'STANDARD' | 'MATTE' | 'GLOSS' | 'MUAR' }
          : {}),
      },
    };
  }

  return { ok: false, error: `Invalid ${path}.kind` };
}

const MESH_TYPES = new Set(['STANDARD', 'ANTIMOSHKA', 'ANTICAT', 'ANTIDUST']);

const COMMON_KEYS = new Set([
  'itemId',
  'productType',
  'widthMm',
  'heightMm',
  'quantity',
  'meshType',
  'color',
]);

const FRAME_KEYS = new Set([
  ...COMMON_KEYS,
  'frameProfile',
  'fastening',
  'cornerType',
  'handleType',
]);

const WING_KEYS = new Set([...COMMON_KEYS, 'fastening']);

const DOOR_KEYS = new Set([...COMMON_KEYS, 'doorProfile', 'hingesCount']);

const PLISSE_KEYS = new Set([
  ...COMMON_KEYS,
  'openingType',
  'thresholdType',
  'handlesCount',
]);

/**
 * Strict allowlist parse of one AI-facing calculation item.
 * Unknown keys and invalid enum-like values → error string.
 */
export function parseTrustedCalculationItem(
  value: unknown,
  path: string,
): { ok: true; item: CalculationItemInput } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: `Invalid ${path}` };
  }

  const productType = value.productType;
  if (
    productType !== 'FRAME' &&
    productType !== 'WING' &&
    productType !== 'DOOR' &&
    productType !== 'PLISSE_NET'
  ) {
    return { ok: false, error: `Invalid ${path}.productType` };
  }

  const allowed =
    productType === 'FRAME'
      ? FRAME_KEYS
      : productType === 'WING'
        ? WING_KEYS
        : productType === 'DOOR'
          ? DOOR_KEYS
          : PLISSE_KEYS;

  const unknown = assertOnlyKeys(value, allowed, path);
  if (unknown) {
    return { ok: false, error: unknown };
  }

  if (typeof value.itemId !== 'string' || value.itemId.trim() === '') {
    return { ok: false, error: `Invalid ${path}.itemId` };
  }

  const widthMm = optionalNumber(value.widthMm, `${path}.widthMm`);
  if (!widthMm.ok) {
    return { ok: false, error: widthMm.error };
  }
  const heightMm = optionalNumber(value.heightMm, `${path}.heightMm`);
  if (!heightMm.ok) {
    return { ok: false, error: heightMm.error };
  }
  const quantity = optionalInteger(value.quantity, `${path}.quantity`);
  if (!quantity.ok) {
    return { ok: false, error: quantity.error };
  }

  let meshType: CalculationItemInput['meshType'];
  if (value.meshType !== undefined) {
    if (typeof value.meshType !== 'string' || !MESH_TYPES.has(value.meshType)) {
      return { ok: false, error: `Invalid ${path}.meshType` };
    }
    meshType = value.meshType as CalculationItemInput['meshType'];
  }

  let color: CalculationColor | undefined;
  if (value.color !== undefined) {
    const parsedColor = parseColor(value.color, `${path}.color`);
    if (!parsedColor.ok) {
      return { ok: false, error: parsedColor.error };
    }
    color = parsedColor.color;
  }

  const base = {
    itemId: value.itemId,
    productType: productType as CalculationProductType,
    ...(widthMm.value !== undefined ? { widthMm: widthMm.value } : {}),
    ...(heightMm.value !== undefined ? { heightMm: heightMm.value } : {}),
    ...(quantity.value !== undefined ? { quantity: quantity.value } : {}),
    ...(meshType !== undefined ? { meshType } : {}),
    ...(color !== undefined ? { color } : {}),
  };

  if (productType === 'FRAME') {
    if (
      value.frameProfile !== undefined &&
      value.frameProfile !== '25' &&
      value.frameProfile !== '32'
    ) {
      return { ok: false, error: `Invalid ${path}.frameProfile` };
    }
    if (
      value.fastening !== undefined &&
      value.fastening !== 'Z_METAL' &&
      value.fastening !== 'PLUNGER'
    ) {
      return { ok: false, error: `Invalid ${path}.fastening` };
    }
    if (
      value.cornerType !== undefined &&
      value.cornerType !== 'PLASTIC' &&
      value.cornerType !== 'ALUMINUM'
    ) {
      return { ok: false, error: `Invalid ${path}.cornerType` };
    }
    if (
      value.handleType !== undefined &&
      value.handleType !== 'PLASTIC' &&
      value.handleType !== 'METAL'
    ) {
      return { ok: false, error: `Invalid ${path}.handleType` };
    }
    return {
      ok: true,
      item: {
        ...base,
        productType: 'FRAME',
        ...(value.frameProfile !== undefined
          ? { frameProfile: value.frameProfile as '25' | '32' }
          : {}),
        ...(value.fastening !== undefined
          ? { fastening: value.fastening as 'Z_METAL' | 'PLUNGER' }
          : {}),
        ...(value.cornerType !== undefined
          ? { cornerType: value.cornerType as 'PLASTIC' | 'ALUMINUM' }
          : {}),
        ...(value.handleType !== undefined
          ? { handleType: value.handleType as 'PLASTIC' | 'METAL' }
          : {}),
      },
    };
  }

  if (productType === 'WING') {
    if (value.fastening !== undefined && value.fastening !== 'WING_FLAGS') {
      return { ok: false, error: `Invalid ${path}.fastening` };
    }
    return {
      ok: true,
      item: {
        ...base,
        productType: 'WING',
        ...(value.fastening !== undefined ? { fastening: 'WING_FLAGS' as const } : {}),
      },
    };
  }

  if (productType === 'DOOR') {
    if (
      value.doorProfile !== undefined &&
      value.doorProfile !== '32' &&
      value.doorProfile !== '42'
    ) {
      return { ok: false, error: `Invalid ${path}.doorProfile` };
    }
    if (value.hingesCount !== undefined && value.hingesCount !== 2 && value.hingesCount !== 3) {
      return { ok: false, error: `Invalid ${path}.hingesCount` };
    }
    return {
      ok: true,
      item: {
        ...base,
        productType: 'DOOR',
        ...(value.doorProfile !== undefined
          ? { doorProfile: value.doorProfile as '32' | '42' }
          : {}),
        ...(value.hingesCount !== undefined
          ? { hingesCount: value.hingesCount as 2 | 3 }
          : {}),
      },
    };
  }

  // PLISSE_NET
  if (
    value.openingType !== undefined &&
    value.openingType !== 'SIDE' &&
    value.openingType !== 'COUNTER' &&
    value.openingType !== 'UP'
  ) {
    return { ok: false, error: `Invalid ${path}.openingType` };
  }
  if (
    value.thresholdType !== undefined &&
    value.thresholdType !== 'STANDARD' &&
    value.thresholdType !== 'LOW' &&
    value.thresholdType !== 'REINFORCED'
  ) {
    return { ok: false, error: `Invalid ${path}.thresholdType` };
  }
  const handlesCount = optionalInteger(value.handlesCount, `${path}.handlesCount`);
  if (!handlesCount.ok) {
    return { ok: false, error: handlesCount.error };
  }
  return {
    ok: true,
    item: {
      ...base,
      productType: 'PLISSE_NET',
      ...(value.openingType !== undefined
        ? { openingType: value.openingType as 'SIDE' | 'COUNTER' | 'UP' }
        : {}),
      ...(value.thresholdType !== undefined
        ? {
            thresholdType: value.thresholdType as 'STANDARD' | 'LOW' | 'REINFORCED',
          }
        : {}),
      ...(handlesCount.value !== undefined ? { handlesCount: handlesCount.value } : {}),
    },
  };
}

export const TRUSTED_ITEM_ALLOWED_FIELDS = {
  FRAME: [...FRAME_KEYS],
  WING: [...WING_KEYS],
  DOOR: [...DOOR_KEYS],
  PLISSE_NET: [...PLISSE_KEYS],
} as const;
