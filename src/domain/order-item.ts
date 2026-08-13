import type { Fact } from './fact.js';

export const MEASUREMENT_BASIS_VALUES = ['PRODUCT_SIZE', 'LIGHT_OPENING'] as const;

export type MeasurementBasis = (typeof MEASUREMENT_BASIS_VALUES)[number];

export const ORDER_ITEM_FACT_FIELDS = [
  'productType',
  'quantity',
  'widthMm',
  'heightMm',
  'measurementBasis',
  'meshType',
  'profileType',
  'profileColor',
  'ral',
  'colorFinish',
  'fastening',
  'openingType',
  'comment',
] as const;

export type OrderItemFactField = (typeof ORDER_ITEM_FACT_FIELDS)[number];

export type OrderItemFactValue = {
  productType: string;
  quantity: number;
  widthMm: number;
  heightMm: number;
  measurementBasis: MeasurementBasis;
  meshType: string;
  profileType: string;
  profileColor: string;
  ral: string;
  colorFinish: string;
  fastening: string;
  openingType: string;
  comment: string;
};

export type OrderItemFacts = {
  [K in OrderItemFactField]?: Fact<OrderItemFactValue[K]>;
};

export interface OrderItem extends OrderItemFacts {
  id: string;
}

export function createEmptyOrderItem(id: string): OrderItem {
  return { id };
}
