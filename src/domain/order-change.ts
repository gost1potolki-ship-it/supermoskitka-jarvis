export type OrderChangeType = 'FIELD_CHANGED';

export interface OrderChange {
  type: OrderChangeType;
  orderItemId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  sourceMessageId: string;
}
