import { getFactValue, type OrderMemory } from '../../domain/index.js';

export type ProductPricingStrategyKind =
  | 'FRAME_COMPONENT_COST'
  | 'EXISTING_PRODUCT_FORMULA'
  | 'DIRECT_COST_BASIS_INCOMPLETE';

export interface ProductPricingStrategy {
  kind: ProductPricingStrategyKind;
}

function itemProductTypes(memory: OrderMemory): string[] {
  return memory.items
    .map((item) => getFactValue(item.productType))
    .filter((value): value is string => value !== undefined);
}

export function resolveOrderPricingStrategy(
  memory: OrderMemory,
  deliveryType: 'city' | 'out' | 'pickup',
): ProductPricingStrategy {
  if (deliveryType === 'out') {
    return { kind: 'DIRECT_COST_BASIS_INCOMPLETE' };
  }

  const productTypes = itemProductTypes(memory);
  if (productTypes.length === 0) {
    return { kind: 'DIRECT_COST_BASIS_INCOMPLETE' };
  }

  const unique = new Set(productTypes);
  const allFrame = unique.size === 1 && unique.has('FRAME');
  const allExistingFormula =
    unique.size > 0 &&
    [...unique].every((type) => type === 'DOOR' || type === 'PLISSE_NET');

  if (allFrame) {
    return { kind: 'FRAME_COMPONENT_COST' };
  }

  if (allExistingFormula) {
    return { kind: 'EXISTING_PRODUCT_FORMULA' };
  }

  return { kind: 'DIRECT_COST_BASIS_INCOMPLETE' };
}
