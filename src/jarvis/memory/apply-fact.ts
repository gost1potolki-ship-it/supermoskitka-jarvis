import {
  createFact,
  getOrderItem,
  type Fact,
  type FactSource,
  type OrderChange,
  type OrderItem,
  type OrderItemFactField,
  type OrderItemFactValue,
  type OrderMemory,
} from '../../domain/index.js';

export interface ApplyFactInput<K extends OrderItemFactField> {
  orderItemId: string;
  field: K;
  value: OrderItemFactValue[K];
  source: FactSource;
  now?: string;
}

export interface ApplyFactResult {
  memory: OrderMemory;
  change: OrderChange | null;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return Object.is(a, b);
}

function withUpdatedItem(memory: OrderMemory, item: OrderItem, now: string): OrderMemory {
  return {
    ...memory,
    items: memory.items.map((existing) => (existing.id === item.id ? item : existing)),
    updatedAt: now,
  };
}

export function applyOrderItemFact<K extends OrderItemFactField>(
  memory: OrderMemory,
  input: ApplyFactInput<K>,
): ApplyFactResult {
  const item = getOrderItem(memory, input.orderItemId);
  if (!item) {
    throw new Error(`Order item not found: ${input.orderItemId}`);
  }

  const now = input.now ?? input.source.sourceTimestamp;
  const existing = item[input.field] as Fact<OrderItemFactValue[K]> | undefined;

  if (!existing) {
    const updatedItem: OrderItem = {
      ...item,
      [input.field]: createFact(input.value, input.source),
    };

    return {
      memory: withUpdatedItem(memory, updatedItem, now),
      change: null,
    };
  }

  if (valuesEqual(existing.current.value, input.value)) {
    return { memory, change: null };
  }

  const previous = existing.current;
  const updatedFact: Fact<OrderItemFactValue[K]> = {
    current: {
      value: input.value,
      ...input.source,
    },
    history: [...existing.history, previous],
  };

  const change: OrderChange = {
    type: 'FIELD_CHANGED',
    orderItemId: input.orderItemId,
    field: input.field,
    oldValue: previous.value,
    newValue: input.value,
    sourceMessageId: input.source.sourceMessageId,
  };

  const updatedItem: OrderItem = {
    ...item,
    [input.field]: updatedFact,
  };

  return {
    memory: {
      ...withUpdatedItem(memory, updatedItem, now),
      changes: [...memory.changes, change],
    },
    change,
  };
}
