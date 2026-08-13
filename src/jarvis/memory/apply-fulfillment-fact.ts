import {
  createFact,
  type Fact,
  type FactSource,
  type FulfillmentFactField,
  type FulfillmentFacts,
  type FulfillmentFactValue,
  type OrderMemory,
} from '../../domain/index.js';

export interface ApplyFulfillmentFactInput<K extends FulfillmentFactField> {
  field: K;
  value: FulfillmentFactValue[K];
  source: FactSource;
  now?: string;
}

export interface ApplyFulfillmentFactResult {
  memory: OrderMemory;
  changed: boolean;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return Object.is(a, b);
}

function setFulfillmentFact<K extends FulfillmentFactField>(
  fulfillment: FulfillmentFacts,
  field: K,
  fact: Fact<FulfillmentFactValue[K]>,
): void {
  fulfillment[field] = fact as unknown as FulfillmentFacts[K];
}

export function applyFulfillmentFact<K extends FulfillmentFactField>(
  memory: OrderMemory,
  input: ApplyFulfillmentFactInput<K>,
): ApplyFulfillmentFactResult {
  const now = input.now ?? input.source.sourceTimestamp;
  const fulfillment: FulfillmentFacts = { ...(memory.fulfillment ?? {}) };
  const existing = fulfillment[input.field] as Fact<FulfillmentFactValue[K]> | undefined;

  if (!existing) {
    setFulfillmentFact(fulfillment, input.field, createFact(input.value, input.source));
    return {
      memory: { ...memory, fulfillment, updatedAt: now },
      changed: true,
    };
  }

  if (valuesEqual(existing.current.value, input.value)) {
    setFulfillmentFact(fulfillment, input.field, {
      ...existing,
      lastSeenSource: input.source,
    });
    return {
      memory: { ...memory, fulfillment, updatedAt: now },
      changed: false,
    };
  }

  setFulfillmentFact(fulfillment, input.field, {
    current: { value: input.value, ...input.source },
    history: [...existing.history, existing.current],
    lastSeenSource: input.source,
  });

  return {
    memory: { ...memory, fulfillment, updatedAt: now },
    changed: true,
  };
}
