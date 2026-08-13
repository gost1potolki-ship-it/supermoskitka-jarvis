import type { CalculationColor, CalculationItemInput } from '../../calculation/index.js';
import { getFactValue, type OrderItem } from '../../domain/index.js';

import type { ResolvedPreliminaryItemInput } from './preliminary-input.js';

const DEFAULT_FRAME_MESH = 'STANDARD' as const;
const DEFAULT_FRAME_PROFILE = '25' as const;
const DEFAULT_FRAME_FASTENING = 'Z_METAL' as const;
const DEFAULT_FRAME_CORNER = 'PLASTIC' as const;
const DEFAULT_FRAME_HANDLE = 'PLASTIC' as const;
const DEFAULT_WING_FASTENING = 'WING_FLAGS' as const;
const DEFAULT_DOOR_PROFILE = '42' as const;
const DEFAULT_DOOR_HINGES = 3 as const;
const DEFAULT_PLISSE_OPENING = 'SIDE' as const;
const DEFAULT_PLISSE_THRESHOLD = 'STANDARD' as const;
const DEFAULT_PLISSE_HANDLES = 1 as const;

function profileColorToCalculationColor(item: OrderItem): CalculationColor | undefined {
  const profileColor = getFactValue(item.profileColor);
  if (profileColor === 'WHITE') {
    return { kind: 'WHITE' };
  }
  if (profileColor === 'BROWN_8017') {
    return { kind: 'BROWN_8017' };
  }
  if (profileColor === 'GRAY_7016') {
    return { kind: 'GRAY_7016' };
  }
  if (profileColor === 'CUSTOM_RAL') {
    const ral = getFactValue(item.ral);
    if (ral === undefined) {
      return undefined;
    }
    const finish = getFactValue(item.colorFinish);
    if (
      finish === 'STANDARD' ||
      finish === 'MATTE' ||
      finish === 'GLOSS' ||
      finish === 'MUAR'
    ) {
      return { kind: 'CUSTOM_RAL', ral, finish };
    }
    return { kind: 'CUSTOM_RAL', ral };
  }
  return undefined;
}

function resolveFrameProfile(item: OrderItem): '25' | '32' {
  const profileType = getFactValue(item.profileType);
  if (profileType === '32') {
    return '32';
  }
  return DEFAULT_FRAME_PROFILE;
}

function resolveMeshType(item: OrderItem): CalculationItemInput['meshType'] {
  const meshType = getFactValue(item.meshType);
  if (
    meshType === 'STANDARD' ||
    meshType === 'ANTIMOSHKA' ||
    meshType === 'ANTICAT' ||
    meshType === 'ANTIDUST'
  ) {
    return meshType;
  }
  return DEFAULT_FRAME_MESH;
}

export function mapMemoryItemToCalculationItemInput(
  orderItem: OrderItem,
  resolved: ResolvedPreliminaryItemInput,
): CalculationItemInput | null {
  const productType = resolved.productType;
  if (
    productType !== 'FRAME' &&
    productType !== 'WING' &&
    productType !== 'DOOR' &&
    productType !== 'PLISSE_NET'
  ) {
    return null;
  }

  if (
    resolved.size.widthMm === undefined ||
    resolved.size.heightMm === undefined
  ) {
    return null;
  }

  const color = profileColorToCalculationColor(orderItem);
  if (color === undefined) {
    return null;
  }

  const base = {
    itemId: resolved.itemId,
    productType,
    widthMm: resolved.size.widthMm,
    heightMm: resolved.size.heightMm,
    quantity: resolved.quantity ?? 1,
    meshType: resolveMeshType(orderItem),
    color,
  };

  if (productType === 'FRAME') {
    const fastening = getFactValue(orderItem.fastening);
    return {
      ...base,
      productType: 'FRAME',
      frameProfile: resolveFrameProfile(orderItem),
      fastening:
        fastening === 'PLUNGER' ? 'PLUNGER' : DEFAULT_FRAME_FASTENING,
      cornerType: DEFAULT_FRAME_CORNER,
      handleType: DEFAULT_FRAME_HANDLE,
    };
  }

  if (productType === 'WING') {
    return {
      ...base,
      productType: 'WING',
      fastening: DEFAULT_WING_FASTENING,
    };
  }

  if (productType === 'DOOR') {
    return {
      ...base,
      productType: 'DOOR',
      doorProfile: DEFAULT_DOOR_PROFILE,
      hingesCount: DEFAULT_DOOR_HINGES,
    };
  }

  const openingType = getFactValue(orderItem.openingType);
  return {
    ...base,
    productType: 'PLISSE_NET',
    openingType:
      openingType === 'COUNTER' || openingType === 'UP'
        ? openingType
        : DEFAULT_PLISSE_OPENING,
    thresholdType: DEFAULT_PLISSE_THRESHOLD,
    handlesCount: DEFAULT_PLISSE_HANDLES,
  };
}
