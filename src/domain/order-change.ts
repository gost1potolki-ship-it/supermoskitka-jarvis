import type { OrderItemFactField } from './order-item.js';

export type OrderChangeType = 'FIELD_CHANGED';

export interface OrderChange {
  type: OrderChangeType;
  orderItemId: string;
  field: OrderItemFactField;
  oldValue: unknown;
  newValue: unknown;
  sourceMessageId: string;
}
