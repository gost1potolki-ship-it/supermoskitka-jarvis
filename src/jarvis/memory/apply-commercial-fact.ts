import {
  createFact,
  type CommercialFactField,
  type CommercialFacts,
  type CommercialFactValue,
  type Fact,
  type FactSource,
  type OrderMemory,
} from '../../domain/index.js';

export interface ApplyCommercialFactInput<K extends CommercialFactField> {
  field: K;
  value: CommercialFactValue[K];
  source: FactSource;
  now?: string;
}

export interface ApplyCommercialFactResult {
  memory: OrderMemory;
  changed: boolean;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return Object.is(a, b);
}

function setCommercialFact<K extends CommercialFactField>(
  commercial: CommercialFacts,
  field: K,
  fact: Fact<CommercialFactValue[K]>,
): void {
  commercial[field] = fact as unknown as CommercialFacts[K];
}

export function applyCommercialFact<K extends CommercialFactField>(
  memory: OrderMemory,
  input: ApplyCommercialFactInput<K>,
): ApplyCommercialFactResult {
  const now = input.now ?? input.source.sourceTimestamp;
  const commercial: CommercialFacts = { ...(memory.commercial ?? {}) };
  const existing = commercial[input.field] as Fact<CommercialFactValue[K]> | undefined;

  let nextMemory: OrderMemory = memory;

  if (!existing) {
    setCommercialFact(commercial, input.field, createFact(input.value, input.source));
    nextMemory = { ...memory, commercial, updatedAt: now };
  } else if (valuesEqual(existing.current.value, input.value)) {
    setCommercialFact(commercial, input.field, {
      ...existing,
      lastSeenSource: input.source,
    });
    nextMemory = { ...memory, commercial, updatedAt: now };
    return { memory: nextMemory, changed: false };
  } else {
    setCommercialFact(commercial, input.field, {
      current: { value: input.value, ...input.source },
      history: [...existing.history, existing.current],
      lastSeenSource: input.source,
    });
    nextMemory = { ...memory, commercial, updatedAt: now };
  }

  if (input.field === 'preliminaryPriceAccepted') {
    if (input.value === true && nextMemory.preliminaryQuote) {
      nextMemory = {
        ...nextMemory,
        acceptedPreliminaryQuoteId: nextMemory.preliminaryQuote.quoteId,
      };
    } else if (input.value === false) {
      nextMemory = {
        ...nextMemory,
        acceptedPreliminaryQuoteId: undefined,
      };
    }
  }

  return {
    memory: nextMemory,
    changed: true,
  };
}
