import type { Fact } from './fact.js';

export const ORDER_ITEM_FACT_FIELDS = [
  'productType',
  'quantity',
  'widthMm',
  'heightMm',
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
