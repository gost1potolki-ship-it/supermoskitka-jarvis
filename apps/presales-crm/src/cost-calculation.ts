import { calculatePrice } from '@calc/logic/calculations';
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
import { RAW_PRICES } from './raw-prices';

export interface CalculationResult {
  total: number;
  install: number;
  costMaterials: number;
  costAssembly: number;
  costTotal: number;
  profit: number;
  marginPercent: number;
}

export interface ItemCostResult {
  costMaterials: number;
  costAssembly: number;
  costItemTotal: number;
  profit: number;
  marginPercent: number;
}

export interface OrderCostResult {
  totalItemsCost: number;
  itemsCount: number;
  costMounting: number;
  costDelivery: number;
  orderTotalCost: number;
  orderProfit: number;
  orderMarginPercent: number;
}

export interface OrderRetailTotals {
  grandTotal: number;
  deliveryCost: number;
  measurementFee?: number;
}

/** Минимальные поля позиции для пересчёта себестоимости */
export interface CartItemCostInput {
  type: ProductType;
  width?: number;
  height?: number;
  quantity?: number;
  price: number;
  color?: ColorType;
  mesh?: MeshType;
  mount?: MountType;
  cornerType?: CornerType;
  handleType?: HandleType;
  frameProfile?: '25' | '32';
  doorProfile?: '32' | '42';
  hingesCount?: number;
  hasLatch?: boolean;
  hasBolt?: boolean;
  subType?: 'window' | 'door' | 'pvc' | 'alu';
  opening?: PlisseOpening;
  threshold?: PlisseThreshold;
  handles?: number;
  costMaterials?: number;
  costAssembly?: number;
  costTotal?: number;
  profit?: number;
}

type RawColorKey = 'white' | 'brown' | 'gray';

function toRawColor(color: ColorType | undefined): RawColorKey {
  if (color === 'brown') return 'brown';
  if (color === 'gray' || color === 'gray7040') return 'gray';
  return 'white';
}

function meshToRawKey(mesh: MeshType | undefined): keyof typeof RAW_PRICES.PRICES_MESH {
  if (mesh === 'anticat') return 'anticat';
  if (mesh === 'antipyl' || mesh === 'antipollen') return 'antidust';
  if (mesh === 'antimoshka' || mesh === 'antimosquito' || mesh === 'antikoshka') return 'antimosquito';
  return 'standard';
}

function profilePricePerMeter(type: ProductType, color: RawColorKey): number {
  if (type === ProductType.WING) {
    return color === 'white' ? RAW_PRICES.PRICES_PROFILE.wing_white : RAW_PRICES.PRICES_PROFILE.wing_color;
  }
  return RAW_PRICES.PRICES_PROFILE[color];
}

/**
 * Себестоимость ОДНОГО изделия (ТЗ §2).
 * width / height — в метрах.
 */
export function calculateItemCostUnit(
  type: ProductType,
  widthM: number,
  heightM: number,
  color: ColorType | undefined,
  mesh: MeshType | undefined
): Pick<ItemCostResult, 'costMaterials' | 'costAssembly' | 'costItemTotal'> | null {
  if (type !== ProductType.FRAME && type !== ProductType.WING) {
    return null;
  }
  if (widthM <= 0 || heightM <= 0) return null;

  const c = toRawColor(color);
  const perimeter = (widthM + heightM) * 2;
  const area = widthM * heightM;
  const waste = RAW_PRICES.COEFF_WASTE;

  const costProfile = perimeter * profilePricePerMeter(type, c) * waste;
  const costMesh = area * RAW_PRICES.PRICES_MESH[meshToRawKey(mesh)];
  const costZMetal = perimeter * RAW_PRICES.PRICES_Z_METAL[c];
  const costCorners = RAW_PRICES.PRICES_CORNERS[c];
  const costCord = perimeter * RAW_PRICES.PRICE_CORD;
  const costHandles = RAW_PRICES.PRICE_HANDLES;

  const costImpost = heightM > 1.0
    ? widthM * RAW_PRICES.PRICE_IMPOST * waste + RAW_PRICES.PRICE_IMPOST_FASTENERS
    : 0;

  const costMaterials = Math.round(
    costProfile + costMesh + costZMetal + costCorners + costCord + costHandles + costImpost
  );
  const costAssembly = RAW_PRICES.ASSEMBLY_FEE;
  const costItemTotal = costMaterials + costAssembly;

  return { costMaterials, costAssembly, costItemTotal };
}

/** Себестоимость позиции в корзине (с учётом quantity) */
export function resolveItemCostMetrics(
  item: CartItemCostInput,
  prices: typeof DEFAULT_PRICES = DEFAULT_PRICES
): ItemCostResult | null {
  if (!item.width || !item.height) return null;

  const widthM = item.width / 1000;
  const heightM = item.height / 1000;
  const qty = item.quantity ?? 1;
  const unit = calculateItemCostUnit(item.type, widthM, heightM, item.color, item.mesh);
  if (!unit) return null;

  const costMaterials = unit.costMaterials * qty;
  const costAssembly = unit.costAssembly * qty;
  const costItemTotal = unit.costItemTotal * qty;
  const profit = item.price - costItemTotal;
  const marginPercent = item.price > 0 ? Math.round((profit / item.price) * 1000) / 10 : 0;

  return { costMaterials, costAssembly, costItemTotal, profit, marginPercent };
}

/** Себестоимость всего заказа (ТЗ §3 + доставка как затрата без наценки) */
export function calculateOrderCostMetrics(
  items: CartItemCostInput[],
  retail: OrderRetailTotals,
  options: { globalInstall?: boolean; deliveryType?: 'pickup' | 'city' | 'out' } = {}
): OrderCostResult | null {
  let totalItemsCost = 0;
  let itemsCount = 0;
  let hasCostItems = false;

  for (const item of items) {
    const metrics = resolveItemCostMetrics(item);
    if (!metrics) continue;
    hasCostItems = true;
    totalItemsCost += metrics.costItemTotal;
    itemsCount += item.quantity ?? 1;
  }

  if (!hasCostItems) return null;

  const costMounting = options.globalInstall
    ? (itemsCount === 1
      ? RAW_PRICES.MOUNTING_FEE_SINGLE
      : itemsCount * RAW_PRICES.MOUNTING_FEE_PER_ITEM)
    : 0;

  // Доставка: в выручку входит, в прибыль не конвертируется (затрата = цена для клиента)
  const costDelivery = options.deliveryType !== 'pickup' && options.deliveryType !== undefined
    ? Math.max(0, retail.deliveryCost)
    : 0;

  const orderTotalCost = totalItemsCost + costMounting + costDelivery;

  // Замер входит в «Итого к оплате», но не в себестоимость и не в базу рентабельности
  const measurementFee = Math.max(0, retail.measurementFee ?? 0);
  const revenueForMargin = retail.grandTotal - measurementFee;
  const orderProfit = revenueForMargin - orderTotalCost;
  const orderMarginPercent = revenueForMargin > 0
    ? Math.round((orderProfit / revenueForMargin) * 1000) / 10
    : 0;

  return {
    totalItemsCost,
    itemsCount,
    costMounting,
    costDelivery,
    orderTotalCost,
    orderProfit,
    orderMarginPercent,
  };
}

/** @deprecated используйте orderMarginPercent из calculateOrderCostMetrics */
export function calculateOrderRentability(
  items: CartItemCostInput[],
  retail: OrderRetailTotals,
  options: { globalInstall?: boolean; deliveryType?: 'pickup' | 'city' | 'out' } = {}
): number | null {
  const order = calculateOrderCostMetrics(items, retail, options);
  return order?.orderMarginPercent ?? null;
}

export function enrichCartItemCosts<T extends CartItemCostInput>(
  item: T,
  _prices: typeof DEFAULT_PRICES = DEFAULT_PRICES
): T {
  const metrics = resolveItemCostMetrics(item);
  if (!metrics) return item;
  return {
    ...item,
    costMaterials: metrics.costMaterials,
    costAssembly: metrics.costAssembly,
    costTotal: metrics.costItemTotal,
    profit: metrics.profit,
    marginPercent: metrics.marginPercent,
  };
}

/** Розница из calc_v2 + параллельная себестоимость (не меняет retail) */
export function calculateWithCost(
  type: ProductType,
  width: number,
  height: number,
  color: ColorType,
  mesh: MeshType,
  opening: PlisseOpening,
  threshold: PlisseThreshold,
  handles: number,
  quantity: number,
  subType: 'window' | 'door' | 'pvc' | 'alu',
  mount: MountType,
  cornerType: CornerType,
  handleType: HandleType,
  prices: typeof DEFAULT_PRICES,
  doorProfile: '32' | '42' = '42',
  hingesCount: number = 3,
  hasLatch: boolean = true,
  hasBolt: boolean = false,
  frameProfile: '25' | '32' = '25'
): CalculationResult {
  const retail = calculatePrice(
    type, width, height, color, mesh, opening, threshold, handles, quantity,
    subType, mount, cornerType, handleType, prices,
    doorProfile, hingesCount, hasLatch, hasBolt, frameProfile
  );

  const metrics = resolveItemCostMetrics({
    type,
    width,
    height,
    quantity,
    price: retail.total,
    color,
    mesh,
  }, prices);

  const costMaterials = metrics?.costMaterials ?? 0;
  const costAssembly = metrics?.costAssembly ?? 0;
  const costTotal = metrics?.costItemTotal ?? 0;
  const profit = retail.total - costTotal;
  const marginPercent = retail.total > 0 ? Math.round((profit / retail.total) * 1000) / 10 : 0;

  return {
    total: retail.total,
    install: retail.install,
    costMaterials,
    costAssembly,
    costTotal,
    profit,
    marginPercent,
  };
}
