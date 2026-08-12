import { resolvePlisseMeshPriceReference } from '../business-rules.js';
import type {
  CalculationColor,
  CalculationCornerType,
  CalculationFrameFastening,
  CalculationHandleType,
  CalculationItemInput,
  CalculationMeshType,
  CalculationPlisseOpening,
  CalculationPlisseThreshold,
  CalculationProductType,
  CurrentCalculationBusinessRules,
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

const EMPTY_RULES: CurrentCalculationBusinessRules = {
  applyLaborOverrides: false,
  applyRegionalDeliveryOverride: false,
  regionalDeliveryPerKm: 50,
  assemblyLabor: {
    frame: { standard: 250, antimoshka: 250, anticat: 250, antidust: 250, plunger: 250 },
    wing: 250,
    door: 850,
  },
  plisseMeshPriceReference: {},
};

export function mapProductType(productType: CalculationProductType): ProductType {
  const mapped = PRODUCT_TYPE_MAP[productType];
  if (!mapped) {
    throw new LegacyMappingError(`Unsupported product type: ${String(productType)}`);
  }
  return mapped;
}

function resolveClassicMeshKey(meshType: CalculationMeshType): MeshType {
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
}

function resolvePlisseMeshCatalogKey(meshType: CalculationMeshType): MeshType {
  switch (meshType) {
    case 'STANDARD':
      return 'standard';
    case 'ANTICAT':
      return 'antikoshka';
    case 'ANTIDUST':
      return 'antipyl';
    case 'ANTIMOSHKA':
      throw new LegacyMappingError(
        'PLISSE_NET ANTIMOSHKA has no dedicated legacy catalog key; current price reference required',
      );
    default:
      throw new LegacyMappingError(`Unsupported plisse mesh type: ${String(meshType)}`);
  }
}

/**
 * Maps Jarvis mesh to a legacy catalog key used for arithmetic.
 * For PLISSE ANTIMOSHKA under current policy, uses ANTIDUST price key as price reference only.
 */
export function mapMeshType(
  productType: CalculationProductType,
  meshType: CalculationMeshType,
  prices: PriceCatalog,
  rules: CurrentCalculationBusinessRules = EMPTY_RULES,
): MeshType {
  if (productType === 'PLISSE_NET') {
    const pricedAs = resolvePlisseMeshPriceReference(meshType, rules);
    let key: MeshType;
    try {
      key = resolvePlisseMeshCatalogKey(pricedAs);
    } catch (error) {
      if (meshType === 'ANTIMOSHKA' && pricedAs === meshType) {
        throw error;
      }
      // Price reference target must itself resolve to a real catalog key.
      throw new LegacyMappingError(
        `PLISSE mesh price reference ${meshType}→${pricedAs} cannot resolve to a legacy catalog key`,
      );
    }

    const section = prices.price_settings.plisse_nets.meshes;
    if (!(key in section)) {
      throw new LegacyMappingError(`Legacy plisse mesh key missing in price catalog: ${key}`);
    }

    if (meshType === 'ANTIMOSHKA' && pricedAs === 'ANTIDUST') {
      // Price reference: catalog key is antipyl; product identity remains ANTIMOSHKA upstream.
      return key;
    }

    if (meshType !== pricedAs) {
      throw new LegacyMappingError(
        `Unexpected PLISSE mesh price reference ${meshType}→${pricedAs}`,
      );
    }

    return key;
  }

  const key = resolveClassicMeshKey(meshType);
  const section = prices.price_settings.classic_frames.meshes;
  if (!(key in section)) {
    throw new LegacyMappingError(`Legacy classic mesh key missing in price catalog: ${key}`);
  }
  return key;
}

/**
 * GRAY_7016 is one business color.
 * Classic engines use legacy key "gray"; plisse engines use "anthracite".
 */
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
      return productType === 'PLISSE_NET' ? 'anthracite' : 'gray';
    case 'CUSTOM_RAL':
      if (color.ral.trim() === '') {
        throw new LegacyMappingError('CUSTOM_RAL requires a non-empty ral value');
      }
      // Finish is order metadata; legacy arithmetic uses color key `ral` only.
      return 'ral';
    default:
      throw new LegacyMappingError(
        `Unsupported calculation color: ${String((color as { kind: string }).kind)}`,
      );
  }
}

export function mapFrameFastening(fastening: CalculationFrameFastening): MountType {
  switch (fastening) {
    case 'Z_METAL':
      return 'z_metal';
    case 'PLUNGER':
      return 'plunger';
    default:
      throw new LegacyMappingError(`Unsupported frame fastening: ${String(fastening)}`);
  }
}

export function mapCornerType(cornerType: CalculationCornerType): CornerType {
  switch (cornerType) {
    case 'ALUMINUM':
      return 'aluminum';
    case 'PLASTIC':
      return 'plastic';
    default:
      throw new LegacyMappingError(`Unsupported corner type: ${String(cornerType)}`);
  }
}

export function mapHandleType(handleType: CalculationHandleType): HandleType {
  switch (handleType) {
    case 'METAL':
      return 'metal';
    case 'PLASTIC':
      return 'plastic';
    default:
      throw new LegacyMappingError(`Unsupported handle type: ${String(handleType)}`);
  }
}

export function mapOpening(opening: CalculationPlisseOpening): PlisseOpening {
  switch (opening) {
    case 'SIDE':
      return 'side';
    case 'COUNTER':
      return 'counter';
    case 'UP':
      return 'up';
    default:
      throw new LegacyMappingError(`Unsupported plisse opening: ${String(opening)}`);
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
    default:
      throw new LegacyMappingError(`Unsupported plisse threshold: ${String(threshold)}`);
  }
}

export function mapCalculationItemToLegacy(
  item: CalculationItemInput,
  prices: PriceCatalog,
  rules: CurrentCalculationBusinessRules = EMPTY_RULES,
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
  const mesh = mapMeshType(item.productType, item.meshType, prices, rules);
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
      cornerType: mapCornerType(item.cornerType),
      handleType: mapHandleType(item.handleType),
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
    if (item.doorProfile === '32') {
      throw new LegacyMappingError(
        'DOOR profile 32: CURRENT_PRICING_GAP — dedicated 32mm door hardware prices are absent',
      );
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
      'REINFORCED threshold currently does not change arithmetic in legacy PlisseNetEngine (NOT_PRICE_AFFECTING_IN_CURRENT_ENGINE)',
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
