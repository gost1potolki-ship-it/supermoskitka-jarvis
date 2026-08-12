import { DEFAULT_PRICES, type LegacyPriceCatalog } from './embedded-default-prices.js';
import { ProductType, type ArchivedOrder, type OrderState, type PaymentMethod } from './types.js';
import { roundToTens } from './calculations.js';

type OrderWithOptionalMeasurementPaidCash = OrderState & {
  measurementPaidCash?: boolean;
  isMeasurementPaidCash?: boolean;
  measurement_paid_cash?: boolean;
};

const MAINTENANCE_TYPES: ProductType[] = [
  ProductType.SEAL,
  ProductType.COMB,
  ProductType.CHILD_LOCK,
  ProductType.ADJUSTMENT,
];

const isProductItem = (item: { type: ProductType }): boolean => !MAINTENANCE_TYPES.includes(item.type);

const resolvePaymentMethod = (value: unknown): PaymentMethod => (value === 'qr' ? 'qr' : 'cash');

const resolveMeasurementPaidCash = (order: OrderWithOptionalMeasurementPaidCash): boolean => {
  return (
    order.measurementPaidCash === true ||
    order.isMeasurementPaidCash === true ||
    order.measurement_paid_cash === true
  );
};

export interface CalculatedOrderTotals {
  itemsBasePrice: number;
  productCount: number;
  measurementFee: number;
  includeMeasurementFee: boolean;
  measurementPaidCash: boolean;
  itemsTotalWithFee: number;
  installTotal: number;
  deliveryCost: number;
  subtotalBeforeDiscount: number;
  discountPercent: 0 | 5 | 10;
  discountAmount: number;
  subtotalAfterDiscount: number;
  paymentMethod: PaymentMethod;
  paymentSurcharge: number;
  grandTotal: number;
}

export function calculateOrderTotals(
  order: OrderWithOptionalMeasurementPaidCash,
  prices: LegacyPriceCatalog
): CalculatedOrderTotals {
  const safeItems = Array.isArray(order?.items) ? order.items : [];
  const itemsBasePrice = safeItems.reduce((sum, item) => sum + item.price, 0);
  const productCount = safeItems.filter(isProductItem).length;

  const includeMeasurementFee = order.includeMeasurementFee === true;
  const measurementPaidCash = resolveMeasurementPaidCash(order);
  const baseMeasurementFee = Math.max(
    DEFAULT_PRICES.price_settings.logistics.measurement_fee ?? 1000,
    prices.price_settings.logistics.measurement_fee ?? 0
  );
  const shouldIncludeMeasurement = includeMeasurementFee && productCount > 0 && !measurementPaidCash;
  const measurementFee = shouldIncludeMeasurement ? baseMeasurementFee : 0;
  const itemsTotalWithFee = itemsBasePrice + measurementFee;

  let autoInstallCost = 0;
  if (order.globalInstall) {
    const totalQty = safeItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
    if (totalQty === 1 && safeItems.length > 0) {
      const item = safeItems[0]!;
      autoInstallCost = item.type === ProductType.FRAME || item.type === ProductType.WING
        ? 900
        : item.installPrice;
    } else {
      autoInstallCost = safeItems.reduce((sum, item) => {
        if (item.type === ProductType.FRAME || item.type === ProductType.WING) {
          return sum + (500 * (item.quantity || 1));
        }
        return sum + item.installPrice;
      }, 0);
    }
  }

  const installTotal = order.globalInstall
    ? (order.installOverride != null ? Math.max(0, Number(order.installOverride) || 0) : autoInstallCost)
    : 0;

  let deliveryCost = 0;
  if (order.deliveryType === 'city') {
    deliveryCost = prices.price_settings.logistics.delivery_base;
  } else if (order.deliveryType === 'out') {
    const km = Number(order.deliveryKm) || 0;
    deliveryCost = prices.price_settings.logistics.delivery_base + (km * prices.price_settings.logistics.delivery_km);
  }

  const subtotalBeforeDiscount = itemsTotalWithFee + installTotal + deliveryCost;
  const discountPercent: 0 | 5 | 10 =
    order.orderDiscountPercent === 5 || order.orderDiscountPercent === 10 ? order.orderDiscountPercent : 0;
  const subtotalAfterDiscount = roundToTens(Math.round(subtotalBeforeDiscount * (1 - discountPercent / 100)));
  const discountAmount = Math.max(0, subtotalBeforeDiscount - subtotalAfterDiscount);

  const paymentMethod = resolvePaymentMethod(order.paymentMethod);
  const paymentSurcharge = paymentMethod === 'qr'
    ? roundToTens(Math.round(subtotalAfterDiscount * 0.08))
    : 0;
  const grandTotal = subtotalAfterDiscount + paymentSurcharge;

  return {
    itemsBasePrice,
    productCount,
    measurementFee,
    includeMeasurementFee,
    measurementPaidCash,
    itemsTotalWithFee,
    installTotal,
    deliveryCost,
    subtotalBeforeDiscount,
    discountPercent,
    discountAmount,
    subtotalAfterDiscount,
    paymentMethod,
    paymentSurcharge,
    grandTotal,
  };
}

export const parseArchiveAmount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const normalized = value.replace(/\s/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }
  return 0;
};

export function parseArchiveStoredTotal(order: Partial<ArchivedOrder> | Record<string, unknown> | unknown): number {
  const raw = (order || {}) as Record<string, unknown>;
  for (const key of ['total', 'orderTotal', 'amount', 'amount_rub']) {
    const parsed = parseArchiveAmount(raw[key]);
    if (parsed > 0) return parsed;
  }
  return 0;
}

export function resolveArchiveDisplayTotal(
  order: Partial<ArchivedOrder> | Record<string, unknown> | unknown,
  calculatedGrandTotal: number
): number {
  if (calculatedGrandTotal > 0) return calculatedGrandTotal;
  return parseArchiveStoredTotal(order);
}

export interface ManagerWorkTotalResult {
  totals: CalculatedOrderTotals;
  managerTotal: number;
  measurementDeduction: number;
}

/** Итог для отправки в работу: сначала полная сумма (нал/QR), затем −1000 ₽ если замер уже оплачен наличными. */
export function calculateManagerWorkTotal(
  order: OrderWithOptionalMeasurementPaidCash,
  prices: LegacyPriceCatalog,
  isMeasurementPaidCash: boolean
): ManagerWorkTotalResult {
  const safeItems = Array.isArray(order?.items) ? order.items : [];
  const totals = calculateOrderTotals(
    {
      ...order,
      items: safeItems,
      includeMeasurementFee: order.includeMeasurementFee !== false,
      measurementPaidCash: false,
      isMeasurementPaidCash: false,
      measurement_paid_cash: false,
    },
    prices
  );
  const baseMeasurementFee = Math.max(
    DEFAULT_PRICES.price_settings.logistics.measurement_fee ?? 1000,
    prices.price_settings.logistics.measurement_fee ?? 0
  );
  const measurementDeduction =
    isMeasurementPaidCash && totals.productCount > 0 ? baseMeasurementFee : 0;
  const managerTotal = Math.max(0, totals.grandTotal - measurementDeduction);
  return { totals, managerTotal, measurementDeduction };
}
