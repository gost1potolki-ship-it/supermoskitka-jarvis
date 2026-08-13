import type { OrderMemory, PreliminaryQuoteSnapshot } from '../../domain/index.js';

import type { GuardedPreliminaryPrice } from './guarded-preliminary-price.js';
import { attachPreliminaryQuote, buildPreliminaryQuoteSnapshot } from './preliminary-quote.js';
import {
  preliminaryQuotePersistSource,
  syncPreliminaryFulfillmentFacts,
} from './sync-preliminary-fulfillment.js';

export interface PersistPreliminaryQuoteInput {
  memory: OrderMemory;
  guarded: GuardedPreliminaryPrice;
  createdAt?: string;
  deliveryType?: 'city' | 'out' | 'pickup';
}

export class PreliminaryQuoteService {
  persistAfterPreliminaryCalculation(input: PersistPreliminaryQuoteInput): {
    memory: OrderMemory;
    snapshot: PreliminaryQuoteSnapshot;
  } {
    const createdAt = input.createdAt ?? new Date().toISOString();
    let memory = input.memory;
    if (input.deliveryType !== undefined) {
      memory = syncPreliminaryFulfillmentFacts(
        memory,
        input.deliveryType,
        preliminaryQuotePersistSource(createdAt),
      );
    }
    const snapshot = buildPreliminaryQuoteSnapshot({
      memory,
      guarded: input.guarded,
      createdAt,
    });
    return {
      snapshot,
      memory: attachPreliminaryQuote(memory, snapshot, createdAt),
    };
  }
}
