import { resolveFrameAssemblyLabor } from './business-rules.js';
import {
  CALCULATION_ENGINE_VERSION,
  type CalculationEngine,
  type CalculationItemInput,
  type CalculationItemResult,
  type CalculationOutcome,
  type CalculationRequest,
  type PriceCatalog,
  type PriceCatalogProvider,
  type PriceCatalogSnapshot,
} from './calculation-types.js';
import { calculatePrice } from './legacy/calculations.js';
import {
  LegacyMappingError,
  mapCalculationItemToLegacy,
  mapProductType,
} from './legacy/legacy-input-mapper.js';
import { calculateOrderTotals } from './legacy/order-totals.js';
import {
  DOOR_32_PRICING_GAP_WARNING,
  collectInvalidEnumFields,
  collectInvalidNumericFields,
  collectMissingFields,
  collectRequestValidationFields,
  isDoor32CurrentPricingGap,
  isSupportedProductType,
} from './validation.js';

function cloneCatalog(prices: PriceCatalog): PriceCatalog {
  return structuredClone(prices);
}

function applyCurrentOverrides(
  snapshot: PriceCatalogSnapshot,
  item: CalculationItemInput,
): { prices: PriceCatalog; warnings: string[] } {
  const warnings: string[] = [];
  const prices = cloneCatalog(snapshot.prices);
  const rules = snapshot.businessRules;

  if (rules.applyRegionalDeliveryOverride) {
    prices.price_settings.logistics.delivery_km = rules.regionalDeliveryPerKm;
  }

  if (rules.applyLaborOverrides) {
    if (item.productType === 'FRAME' && item.meshType && item.fastening) {
      prices.price_settings.classic_frames.markups.assembly_labor = resolveFrameAssemblyLabor(
        item.meshType,
        item.fastening,
        rules,
      );
    } else if (item.productType === 'WING') {
      prices.price_settings.classic_frames.markups.assembly_labor = rules.assemblyLabor.wing;
    } else if (item.productType === 'DOOR') {
      prices.price_settings.classic_frames.markups.door_assembly_labor = rules.assemblyLabor.door;
    }
  }

  return { prices, warnings };
}

export class SuperMoskitkaCalculationEngine implements CalculationEngine {
  constructor(private readonly priceCatalogProvider: PriceCatalogProvider) {}

  async calculate(request: CalculationRequest): Promise<CalculationOutcome> {
    const catalog = await this.priceCatalogProvider.getPriceCatalog();
    const warnings: string[] = [];
    const missingFields: string[] = [];

    if (!Array.isArray(request.items) || request.items.length === 0) {
      return outcome('needs_input', catalog, [], null, warnings, ['items']);
    }

    for (const item of request.items) {
      if (!isSupportedProductType(String(item.productType))) {
        return outcome(
          'unsupported',
          catalog,
          [],
          null,
          [`Product type is not supported by Jarvis V1 calculation: ${String(item.productType)}`],
          [],
        );
      }

      if (isDoor32CurrentPricingGap(item)) {
        return outcome(
          'unsupported',
          catalog,
          [],
          null,
          [DOOR_32_PRICING_GAP_WARNING],
          [`items[${item.itemId}].doorProfile`],
        );
      }

      missingFields.push(...collectMissingFields(item));
      for (const field of collectInvalidNumericFields(item)) {
        if (!missingFields.includes(field)) {
          missingFields.push(field);
        }
      }
      for (const field of collectInvalidEnumFields(item)) {
        if (!missingFields.includes(field)) {
          missingFields.push(field);
        }
      }
    }

    missingFields.push(...collectRequestValidationFields(request));

    if (missingFields.length > 0) {
      return outcome('needs_input', catalog, [], null, warnings, missingFields);
    }

    void request.customerType;

    const itemResults: CalculationItemResult[] = [];
    const cartItems = [];

    for (const item of request.items) {
      try {
        const { prices, warnings: overrideWarnings } = applyCurrentOverrides(catalog, item);
        warnings.push(...overrideWarnings);

        const mapped = mapCalculationItemToLegacy(item, prices, catalog.businessRules);
        warnings.push(...mapped.warnings);

        const priced = calculatePrice(
          mapped.productType,
          mapped.widthMm,
          mapped.heightMm,
          mapped.color,
          mapped.mesh,
          mapped.opening,
          mapped.threshold,
          mapped.handles,
          mapped.quantity,
          'window',
          mapped.mount,
          mapped.cornerType,
          mapped.handleType,
          prices,
          mapped.doorProfile,
          mapped.hingesCount,
          mapped.hasLatch,
          mapped.hasBolt,
          mapped.frameProfile,
        );

        const unitPrice =
          mapped.quantity > 0 ? Math.round(priced.total / mapped.quantity) : priced.total;

        itemResults.push({
          itemId: item.itemId,
          productType: item.productType,
          quantity: mapped.quantity,
          unitPrice,
          productTotal: priced.total,
          installationTotal: priced.install,
          ...(typeof priced.directCost === 'number' ? { directCost: priced.directCost } : {}),
        });

        cartItems.push({
          id: item.itemId,
          type: mapProductType(item.productType),
          price: priced.total,
          installPrice: priced.install,
          quantity: mapped.quantity,
          details: '',
        });
      } catch (error) {
        if (error instanceof LegacyMappingError) {
          const status = error.message.includes('CURRENT_PRICING_GAP')
            ? 'unsupported'
            : 'needs_input';
          return outcome(
            status,
            catalog,
            [],
            null,
            [...warnings, error.message],
            [`items[${item.itemId}].mapping`],
          );
        }
        throw error;
      }
    }

    const totalsPrices = cloneCatalog(catalog.prices);
    if (catalog.businessRules.applyRegionalDeliveryOverride) {
      totalsPrices.price_settings.logistics.delivery_km =
        catalog.businessRules.regionalDeliveryPerKm;
    }

    const totals = calculateOrderTotals(
      {
        items: cartItems,
        deliveryType: request.delivery?.type ?? 'pickup',
        deliveryKm: request.delivery?.type === 'out' ? (request.delivery.distanceKm ?? 0) : 0,
        globalInstall: request.installation?.enabled === true,
        installOverride: request.installation?.overrideAmount ?? null,
        orderDiscountPercent: request.discount?.percent ?? 0,
        includeMeasurementFee: request.measurement?.includeFee === true,
        measurementPaidCash: request.measurement?.paidCash === true,
        paymentMethod: request.payment?.method ?? 'cash',
      },
      totalsPrices,
    );

    const itemsDirectCost = itemResults.reduce(
      (sum, item) => sum + (item.directCost ?? 0),
      0,
    );
    const trustedDirectCostRub =
      itemsDirectCost +
      totals.measurementFee +
      totals.installTotal +
      totals.deliveryCost;

    return {
      status: 'calculated',
      items: itemResults,
      total: totals.grandTotal,
      warnings,
      missingFields: [],
      calculationVersion: CALCULATION_ENGINE_VERSION,
      priceVersion: catalog.version,
      businessRulesVersion: catalog.businessRulesVersion,
      trustedDirectCostRub,
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

function outcome(
  status: CalculationOutcome['status'],
  catalog: PriceCatalogSnapshot,
  items: CalculationItemResult[],
  total: number | null,
  warnings: string[],
  missingFields: string[],
): CalculationOutcome {
  return {
    status,
    items,
    total,
    warnings,
    missingFields,
    calculationVersion: CALCULATION_ENGINE_VERSION,
    priceVersion: catalog.version,
    businessRulesVersion: catalog.businessRulesVersion,
  };
}
