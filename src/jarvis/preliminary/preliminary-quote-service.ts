import type { OrderMemory, PreliminaryQuoteSnapshot } from '../../domain/index.js';

import {
  attachProfitabilityToMemory,
  type TrustedPreliminaryQuoteProof,
} from './guarded-preliminary-price.js';
import { attachPreliminaryQuote, buildPreliminaryQuoteSnapshot } from './preliminary-quote.js';
import {
  preliminaryQuotePersistSource,
  syncPreliminaryFulfillmentFacts,
} from './sync-preliminary-fulfillment.js';

export interface PersistPreliminaryQuoteInput {
  memory: OrderMemory;
  proof: TrustedPreliminaryQuoteProof;
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
      proof: input.proof,
      createdAt,
    });
    memory = attachPreliminaryQuote(memory, snapshot, createdAt);
    if (input.deliveryType !== undefined) {
      memory = attachProfitabilityToMemory(
        memory,
        snapshot.publicTotalRub,
        input.deliveryType,
        createdAt,
      );
    }
    return {
      snapshot,
      memory,
    };
  }
}
