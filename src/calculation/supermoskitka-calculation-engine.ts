import {
  CALCULATION_ENGINE_VERSION,
  type CalculationEngine,
  type CalculationItemInput,
  type CalculationItemResult,
  type CalculationOutcome,
  type CalculationProductType,
  type CalculationRequest,
  type PriceCatalogProvider,
} from './calculation-types.js';
import { calculatePrice } from './legacy/calculations.js';
import { calculateOrderTotals } from './legacy/order-totals.js';
import { ProductType } from './legacy/types.js';
import {
  collectInvalidNumericFields,
  collectMissingFields,
  isSupportedProductType,
} from './validation.js';

const PRODUCT_TYPE_MAP: Record<CalculationProductType, ProductType> = {
  FRAME: ProductType.FRAME,
  WING: ProductType.WING,
  DOOR: ProductType.DOOR,
  PLISSE_NET: ProductType.PLISSE_NET,
};

export class SuperMoskitkaCalculationEngine implements CalculationEngine {
  constructor(private readonly priceCatalogProvider: PriceCatalogProvider) {}

  async calculate(request: CalculationRequest): Promise<CalculationOutcome> {
    const catalog = await this.priceCatalogProvider.getPriceCatalog();
    const warnings: string[] = [];
    const missingFields: string[] = [];

    if (!Array.isArray(request.items) || request.items.length === 0) {
      return {
        status: 'needs_input',
        items: [],
        total: null,
        warnings,
        missingFields: ['items'],
        calculationVersion: CALCULATION_ENGINE_VERSION,
        priceVersion: catalog.version,
      };
    }

    for (const item of request.items) {
      if (!isSupportedProductType(item.productType)) {
        return {
          status: 'unsupported',
          items: [],
          total: null,
          warnings: [
            `Product type is not supported by Jarvis V1 calculation: ${String(item.productType)}`,
          ],
          missingFields: [],
          calculationVersion: CALCULATION_ENGINE_VERSION,
          priceVersion: catalog.version,
        };
      }

      missingFields.push(...collectMissingFields(item));
      const invalid = collectInvalidNumericFields(item);
      for (const field of invalid) {
        if (!missingFields.includes(field)) {
          missingFields.push(field);
        }
      }
    }

    if (missingFields.length > 0) {
      return {
        status: 'needs_input',
        items: [],
        total: null,
        warnings,
        missingFields,
        calculationVersion: CALCULATION_ENGINE_VERSION,
        priceVersion: catalog.version,
      };
    }

    // customerType is retained for future policy; it must not invent discounts.
    void request.customerType;

    const itemResults: CalculationItemResult[] = [];
    const cartItems = [];

    for (const item of request.items) {
      const priced = priceItem(item, catalog.prices);
      const quantity = item.quantity ?? 1;
      const unitPrice = quantity > 0 ? Math.round(priced.total / quantity) : priced.total;

      itemResults.push({
        itemId: item.itemId,
        productType: item.productType,
        quantity,
        unitPrice,
        productTotal: priced.total,
        installationTotal: priced.install,
      });

      cartItems.push({
        id: item.itemId,
        type: PRODUCT_TYPE_MAP[item.productType],
        price: priced.total,
        installPrice: priced.install,
        quantity,
        details: '',
      });
    }

    const totals = calculateOrderTotals(
      {
        items: cartItems,
        deliveryType: request.delivery?.type ?? 'pickup',
        deliveryKm: request.delivery?.distanceKm ?? 0,
        globalInstall: request.installation?.enabled === true,
        installOverride: request.installation?.overrideAmount ?? null,
        orderDiscountPercent: request.discount?.percent ?? 0,
        includeMeasurementFee: request.measurement?.includeFee === true,
        measurementPaidCash: request.measurement?.paidCash === true,
        paymentMethod: request.payment?.method ?? 'cash',
      },
      catalog.prices,
    );

    return {
      status: 'calculated',
      items: itemResults,
      total: totals.grandTotal,
      warnings,
      missingFields: [],
      calculationVersion: CALCULATION_ENGINE_VERSION,
      priceVersion: catalog.version,
      orderBreakdown: {
        itemsBasePrice: totals.itemsBasePrice,
        measurementFee: totals.measurementFee,
        installTotal: totals.installTotal,
        deliveryCost: totals.deliveryCost,
        discountPercent: totals.discountPercent,
        discountAmount: totals.discountAmount,
        paymentSurcharge: totals.paymentSurcharge,
        grandTotal: totals.grandTotal,
      },
    };
  }
}

function priceItem(
  item: CalculationItemInput,
  prices: Parameters<typeof calculatePrice>[13],
): { total: number; install: number } {
  const productType = PRODUCT_TYPE_MAP[item.productType];
  const width = item.widthMm!;
  const height = item.heightMm!;
  const quantity = item.quantity!;
  const color = item.color!;
  const mesh = item.meshType!;
  const opening = item.openingType ?? 'side';
  const threshold = item.thresholdType ?? 'standard';
  const handles = item.handlesCount ?? 1;
  const mount = item.fastening ?? 'z_metal';
  const cornerType = item.cornerType ?? 'plastic';
  const handleType = item.handleType ?? 'plastic';
  const doorProfile = item.doorProfile ?? '42';
  const hingesCount = item.hingesCount ?? 3;
  const hasLatch = item.hasLatch ?? true;
  const frameProfile = item.frameProfile ?? '25';

  // Jarvis V1 never enables bolt/shpinгалет.
  const hasBolt = false;

  return calculatePrice(
    productType,
    width,
    height,
    color,
    mesh,
    opening,
    threshold,
    handles,
    quantity,
    'window',
    mount,
    cornerType,
    handleType,
    prices,
    doorProfile,
    hingesCount,
    hasLatch,
    hasBolt,
    frameProfile,
  );
}
