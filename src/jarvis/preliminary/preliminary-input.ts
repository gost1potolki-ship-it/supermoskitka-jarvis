import { getFactValue, type OrderItem, type OrderMemory } from '../../domain/index.js';

export const ESTIMATED_AVERAGE_WIDTH_MM = 800;
export const ESTIMATED_AVERAGE_HEIGHT_MM = 1600;
export const LIGHT_OPENING_MARGIN_MM = 40;

export type PreliminarySizeSource =
  | 'PRODUCT_SIZE'
  | 'LIGHT_OPENING'
  | 'ESTIMATED_AVERAGE'
  | 'NEEDS_SIZE_BASIS'
  | 'NEEDS_INPUT';

export interface ResolvedPreliminarySize {
  source: PreliminarySizeSource;
  widthMm?: number;
  heightMm?: number;
}

export interface ResolvedPreliminaryItemInput {
  itemId: string;
  productType?: string;
  quantity?: number;
  size: ResolvedPreliminarySize;
  measurementBasis?: 'PRODUCT_SIZE' | 'LIGHT_OPENING';
  meshType?: string;
  profileType?: string;
  profileColor?: string;
  ral?: string;
  colorFinish?: string;
  fastening?: string;
  openingType?: string;
}

export interface ResolvePreliminaryInputsResult {
  items: ResolvedPreliminaryItemInput[];
  blocking: PreliminarySizeSource[];
}

function hasBothDimensions(item: OrderItem): boolean {
  return getFactValue(item.widthMm) !== undefined && getFactValue(item.heightMm) !== undefined;
}

function hasPartialDimensions(item: OrderItem): boolean {
  const width = getFactValue(item.widthMm);
  const height = getFactValue(item.heightMm);
  return (width !== undefined) !== (height !== undefined);
}

function isAverageEligibleProduct(productType: string | undefined): boolean {
  return productType === 'FRAME' || productType === 'WING';
}

function isSizeRequiredProduct(productType: string | undefined): boolean {
  return productType === 'DOOR' || productType === 'PLISSE_NET';
}

export function resolveItemCalculationSize(item: OrderItem): ResolvedPreliminarySize {
  const productType = getFactValue(item.productType);
  const measurementBasis = getFactValue(item.measurementBasis);

  if (hasPartialDimensions(item)) {
    return { source: 'NEEDS_INPUT' };
  }

  if (hasBothDimensions(item)) {
    const widthMm = getFactValue(item.widthMm)!;
    const heightMm = getFactValue(item.heightMm)!;

    if (!measurementBasis) {
      return { source: 'NEEDS_SIZE_BASIS', widthMm, heightMm };
    }

    if (measurementBasis === 'PRODUCT_SIZE') {
      return { source: 'PRODUCT_SIZE', widthMm, heightMm };
    }

    return {
      source: 'LIGHT_OPENING',
      widthMm: widthMm + LIGHT_OPENING_MARGIN_MM,
      heightMm: heightMm + LIGHT_OPENING_MARGIN_MM,
    };
  }

  if (isAverageEligibleProduct(productType)) {
    return {
      source: 'ESTIMATED_AVERAGE',
      widthMm: ESTIMATED_AVERAGE_WIDTH_MM,
      heightMm: ESTIMATED_AVERAGE_HEIGHT_MM,
    };
  }

  if (isSizeRequiredProduct(productType)) {
    return { source: 'NEEDS_INPUT' };
  }

  return { source: 'NEEDS_INPUT' };
}

export function resolvePreliminaryInputs(memory: OrderMemory): ResolvePreliminaryInputsResult {
  const items = memory.items.map((item) => {
    const size = resolveItemCalculationSize(item);
    return {
      itemId: item.id,
      productType: getFactValue(item.productType),
      quantity: getFactValue(item.quantity),
      size,
      measurementBasis: getFactValue(item.measurementBasis),
      meshType: getFactValue(item.meshType),
      profileType: getFactValue(item.profileType),
      profileColor: getFactValue(item.profileColor),
      ral: getFactValue(item.ral),
      colorFinish: getFactValue(item.colorFinish),
      fastening: getFactValue(item.fastening),
      openingType: getFactValue(item.openingType),
    };
  });

  const blocking = [
    ...new Set(
      items
        .map((item) => item.size.source)
        .filter(
          (source): source is 'NEEDS_SIZE_BASIS' | 'NEEDS_INPUT' =>
            source === 'NEEDS_SIZE_BASIS' || source === 'NEEDS_INPUT',
        ),
    ),
  ];

  return { items, blocking };
}
