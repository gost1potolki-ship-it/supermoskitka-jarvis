import { roundToTens } from '@calc/logic/calculations';
import { PRICES as DEFAULT_PRICES } from '@calc/constants';
import {
  ProductType,
  type ColorType,
  type CornerType,
  type HandleType,
  type MeshType,
  type MountType,
  type PlisseOpening,
  type PlisseThreshold,
} from '@calc/types';
import { calculateWithCost } from './cost-calculation';
import type { WebCartItem } from './types';

export const RETAIL_MARKUP_OPTIONS = [0, 10, 20, 30, 40, 50] as const;
export type RetailMarkupPercent = (typeof RETAIL_MARKUP_OPTIONS)[number];

const MAINTENANCE_TYPES = new Set<ProductType>([
  ProductType.SEAL,
  ProductType.COMB,
  ProductType.CHILD_LOCK,
  ProductType.ADJUSTMENT,
]);

export function parseRetailMarkupPercent(value: unknown, legacyMarkup30?: boolean): RetailMarkupPercent {
  if (value === 10 || value === 20 || value === 30 || value === 40 || value === 50) return value;
  if (legacyMarkup30) return 30;
  return 0;
}

export function applyRetailMarkup(price: number, markupPercent: RetailMarkupPercent): number {
  if (!markupPercent) return price;
  return roundToTens(price * (1 + markupPercent / 100));
}

function calcItemRetail(
  item: WebCartItem,
  prices: typeof DEFAULT_PRICES
): ReturnType<typeof calculateWithCost> | null {
  const maintenance = MAINTENANCE_TYPES.has(item.type);
  const width = item.width ?? 0;
  const height = item.height ?? 0;
  if (!maintenance && (!width || !height)) return null;

  return calculateWithCost(
    item.type,
    maintenance ? 0 : width,
    maintenance ? 0 : height,
    (item.color ?? 'white') as ColorType,
    (item.mesh ?? 'standard') as MeshType,
    (item.opening ?? 'side') as PlisseOpening,
    (item.threshold ?? 'standard') as PlisseThreshold,
    item.handles ?? 1,
    Math.max(1, item.quantity ?? 1),
    item.subType ?? 'window',
    (item.mount ?? 'z_metal') as MountType,
    (item.cornerType ?? 'plastic') as CornerType,
    (item.handleType ?? 'plastic') as HandleType,
    prices,
    item.doorProfile ?? '42',
    item.hingesCount ?? 3,
    item.hasLatch ?? true,
    item.hasBolt ?? false,
    item.frameProfile ?? '25'
  );
}

export function applyRetailMarkupToResult<T extends { total: number; costTotal: number }>(
  result: T,
  markupPercent: RetailMarkupPercent
): T {
  if (!markupPercent) return result;
  const total = applyRetailMarkup(result.total, markupPercent);
  const profit = total - result.costTotal;
  return {
    ...result,
    total,
    profit,
    marginPercent: total > 0 ? Math.round((profit / total) * 1000) / 10 : 0,
  };
}

export function refreshCartItemPricing(
  item: WebCartItem,
  markupPercent: RetailMarkupPercent,
  prices: typeof DEFAULT_PRICES = DEFAULT_PRICES
): WebCartItem {
  const result = calcItemRetail(item, prices);
  if (!result) return item;

  const priced = applyRetailMarkupToResult(result, markupPercent);

  return {
    ...item,
    price: priced.total,
    installPrice: priced.install,
    costMaterials: priced.costMaterials,
    costAssembly: priced.costAssembly,
    costTotal: priced.costTotal,
    profit: priced.profit,
    marginPercent: priced.marginPercent,
  };
}
