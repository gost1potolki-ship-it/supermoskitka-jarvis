import type {
  CalculationColor,
  CalculationFrameFastening,
  CalculationItemInput,
  CalculationMeshType,
  CalculationPlisseOpening,
  CalculationPlisseThreshold,
  CalculationProductType,
  PriceCatalog,
} from '../calculation-types.js';
import type {
  ColorType,
  CornerType,
  HandleType,
  MeshType,
  MountType,
  PlisseOpening,
  PlisseThreshold,
} from './types.js';
import { ProductType } from './types.js';

export class LegacyMappingError extends Error {
  readonly code = 'LEGACY_MAPPING_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'LegacyMappingError';
  }
}

export interface LegacyMappedItemInput {
  productType: ProductType;
  widthMm: number;
  heightMm: number;
  quantity: number;
  color: ColorType;
  mesh: MeshType;
  mount: MountType;
  cornerType: CornerType;
  handleType: HandleType;
  opening: PlisseOpening;
  threshold: PlisseThreshold;
  handles: number;
  doorProfile: '32' | '42';
  hingesCount: number;
  hasLatch: boolean;
  hasBolt: false;
  frameProfile: '25' | '32';
  warnings: string[];
}

const PRODUCT_TYPE_MAP: Record<CalculationProductType, ProductType> = {
  FRAME: ProductType.FRAME,
  WING: ProductType.WING,
  DOOR: ProductType.DOOR,
  PLISSE_NET: ProductType.PLISSE_NET,
};

export function mapProductType(productType: CalculationProductType): ProductType {
  return PRODUCT_TYPE_MAP[productType];
}

export function mapMeshType(
  productType: CalculationProductType,
  meshType: CalculationMeshType,
  prices: PriceCatalog,
): MeshType {
  if (productType === 'PLISSE_NET') {
    const key = (() => {
      switch (meshType) {
        case 'STANDARD':
          return 'standard';
        case 'ANTICAT':
          return 'antikoshka';
        case 'ANTIDUST':
          return 'antipyl';
        case 'ANTIMOSHKA':
          throw new LegacyMappingError(
            `Mesh ${meshType} is not available for PLISSE_NET in legacy plisse_nets catalog`,
          );
        default:
          throw new LegacyMappingError(`Unsupported plisse mesh type: ${String(meshType)}`);
      }
    })();
    const section = prices.price_settings.plisse_nets.meshes;
    if (!(key in section)) {
      throw new LegacyMappingError(`Legacy plisse mesh key missing in price catalog: ${key}`);
    }
    return key;
  }

  const key = (() => {
    switch (meshType) {
      case 'STANDARD':
        return 'standard';
      case 'ANTIMOSHKA':
        return 'antimoshka';
      case 'ANTICAT':
        return 'anticat';
      case 'ANTIDUST':
        return 'antipyl';
      default:
        throw new LegacyMappingError(`Unsupported classic mesh type: ${String(meshType)}`);
    }
  })();
  const section = prices.price_settings.classic_frames.meshes;
  if (!(key in section)) {
    throw new LegacyMappingError(`Legacy classic mesh key missing in price catalog: ${key}`);
  }
  return key;
}

export function mapColor(
  productType: CalculationProductType,
  color: CalculationColor,
): ColorType {
  switch (color.kind) {
    case 'WHITE':
      return 'white';
    case 'BROWN_8017':
      return 'brown';
    case 'GRAY_7016':
      return 'gray';
    case 'CUSTOM_RAL':
      if (color.ral.trim() === '') {
        throw new LegacyMappingError('CUSTOM_RAL requires a non-empty ral value');
      }
      // Finish is order metadata; legacy arithmetic uses color key `ral` only.
      void productType;
      return 'ral';
    default:
      throw new LegacyMappingError(`Unsupported calculation color: ${String((color as { kind: string }).kind)}`);
  }
}

export function mapFrameFastening(fastening: CalculationFrameFastening): MountType {
  return fastening === 'Z_METAL' ? 'z_metal' : 'plunger';
}

export function mapOpening(opening: CalculationPlisseOpening): PlisseOpening {
  switch (opening) {
    case 'SIDE':
      return 'side';
    case 'COUNTER':
      return 'counter';
    case 'UP':
      return 'up';
  }
}

export function mapThreshold(threshold: CalculationPlisseThreshold): PlisseThreshold {
  switch (threshold) {
    case 'STANDARD':
      return 'standard';
    case 'LOW':
      return 'low';
    case 'REINFORCED':
      return 'reinforced';
  }
}

export function mapCalculationItemToLegacy(
  item: CalculationItemInput,
  prices: PriceCatalog,
): LegacyMappedItemInput {
  if (
    item.widthMm === undefined ||
    item.heightMm === undefined ||
    item.quantity === undefined ||
    item.meshType === undefined ||
    item.color === undefined
  ) {
    throw new LegacyMappingError('Required item fields are missing before legacy mapping');
  }

  const warnings: string[] = [];
  const productType = mapProductType(item.productType);
  const mesh = mapMeshType(item.productType, item.meshType, prices);
  const color = mapColor(item.productType, item.color);

  if (item.productType === 'FRAME') {
    if (!item.fastening || !item.frameProfile || !item.cornerType || !item.handleType) {
      throw new LegacyMappingError('FRAME requires fastening, frameProfile, cornerType, handleType');
    }
    return {
      productType,
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      quantity: item.quantity,
      color,
      mesh,
      mount: mapFrameFastening(item.fastening),
      cornerType: item.cornerType === 'ALUMINUM' ? 'aluminum' : 'plastic',
      handleType: item.handleType === 'METAL' ? 'metal' : 'plastic',
      opening: 'side',
      threshold: 'standard',
      handles: 1,
      doorProfile: '42',
      hingesCount: 3,
      hasLatch: true,
      hasBolt: false,
      frameProfile: item.frameProfile,
      warnings,
    };
  }

  if (item.productType === 'WING') {
    // Business fastening is WING_FLAGS; legacy ClassicEngine has no dedicated flags mount key.
    // Adapter keeps historical classic mount path `z_metal` and documents the gap.
    return {
      productType,
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      quantity: item.quantity,
      color,
      mesh,
      mount: 'z_metal',
      cornerType: 'plastic',
      handleType: 'plastic',
      opening: 'side',
      threshold: 'standard',
      handles: 1,
      doorProfile: '42',
      hingesCount: 3,
      hasLatch: true,
      hasBolt: false,
      frameProfile: '25',
      warnings,
    };
  }

  if (item.productType === 'DOOR') {
    if (!item.doorProfile || item.hingesCount === undefined) {
      throw new LegacyMappingError('DOOR requires doorProfile and hingesCount');
    }
    return {
      productType,
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      quantity: item.quantity,
      color,
      mesh,
      mount: 'z_metal',
      cornerType: 'plastic',
      handleType: 'plastic',
      opening: 'side',
      threshold: 'standard',
      handles: 2,
      doorProfile: item.doorProfile,
      hingesCount: item.hingesCount,
      hasLatch: true,
      hasBolt: false,
      frameProfile: '25',
      warnings,
    };
  }

  // PLISSE_NET
  if (!item.openingType || !item.thresholdType || item.handlesCount === undefined) {
    throw new LegacyMappingError('PLISSE_NET requires openingType, thresholdType, handlesCount');
  }
  if (item.thresholdType === 'REINFORCED') {
    warnings.push(
      'REINFORCED threshold currently does not change arithmetic in legacy PlisseNetEngine',
    );
  }

  return {
    productType,
    widthMm: item.widthMm,
    heightMm: item.heightMm,
    quantity: item.quantity,
    color,
    mesh,
    mount: 'standard',
    cornerType: 'plastic',
    handleType: 'plastic',
    opening: mapOpening(item.openingType),
    threshold: mapThreshold(item.thresholdType),
    handles: item.handlesCount,
    doorProfile: '42',
    hingesCount: 3,
    hasLatch: true,
    hasBolt: false,
    frameProfile: '25',
    warnings,
  };
}
