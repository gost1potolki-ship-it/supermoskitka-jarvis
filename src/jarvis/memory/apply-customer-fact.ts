import {
  createFact,
  type CustomerFactField,
  type CustomerFacts,
  type CustomerFactValue,
  type Fact,
  type FactSource,
  type OrderMemory,
} from '../../domain/index.js';

export interface ApplyCustomerFactInput<K extends CustomerFactField> {
  field: K;
  value: CustomerFactValue[K];
  source: FactSource;
  now?: string;
}

export interface ApplyCustomerFactResult {
  memory: OrderMemory;
  changed: boolean;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return Object.is(a, b);
}

function setCustomerFact<K extends CustomerFactField>(
  customer: CustomerFacts,
  field: K,
  fact: Fact<CustomerFactValue[K]>,
): void {
  customer[field] = fact as unknown as CustomerFacts[K];
}

export function applyCustomerFact<K extends CustomerFactField>(
  memory: OrderMemory,
  input: ApplyCustomerFactInput<K>,
): ApplyCustomerFactResult {
  const now = input.now ?? input.source.sourceTimestamp;
  const customer: CustomerFacts = { ...(memory.customer ?? {}) };
  const existing = customer[input.field] as Fact<CustomerFactValue[K]> | undefined;

  if (!existing) {
    setCustomerFact(customer, input.field, createFact(input.value, input.source));
    return {
      memory: { ...memory, customer, updatedAt: now },
      changed: true,
    };
  }

  if (valuesEqual(existing.current.value, input.value)) {
    setCustomerFact(customer, input.field, {
      ...existing,
      lastSeenSource: input.source,
    });
    return {
      memory: { ...memory, customer, updatedAt: now },
      changed: false,
    };
  }

  setCustomerFact(customer, input.field, {
    current: { value: input.value, ...input.source },
    history: [...existing.history, existing.current],
    lastSeenSource: input.source,
  });

  return {
    memory: { ...memory, customer, updatedAt: now },
    changed: true,
  };
}
