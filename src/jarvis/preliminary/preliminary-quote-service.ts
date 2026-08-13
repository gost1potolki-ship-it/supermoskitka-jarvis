import type { OrderMemory, PreliminaryQuoteSnapshot } from '../../domain/index.js';

import { attachPreliminaryQuote, buildPreliminaryQuoteSnapshot } from './preliminary-quote.js';
import { computeQuoteInputFingerprintFromMemory } from './quote-fingerprint.js';

export interface PersistPreliminaryQuoteInput {
  memory: OrderMemory;
  publicTotalRub: number;
  calculationVersion?: string;
  priceVersion?: string;
  pricingPolicyVersion?: string;
  createdAt?: string;
}

export class PreliminaryQuoteService {
  persistAfterPreliminaryCalculation(input: PersistPreliminaryQuoteInput): {
    memory: OrderMemory;
    snapshot: PreliminaryQuoteSnapshot;
  } {
    const fingerprint = computeQuoteInputFingerprintFromMemory(input.memory);
    const snapshot = buildPreliminaryQuoteSnapshot({
      memory: input.memory,
      publicTotalRub: input.publicTotalRub,
      inputFingerprint: fingerprint,
      calculationVersion: input.calculationVersion,
      priceVersion: input.priceVersion,
      pricingPolicyVersion: input.pricingPolicyVersion,
      createdAt: input.createdAt,
    });
    return {
      snapshot,
      memory: attachPreliminaryQuote(input.memory, snapshot, input.createdAt),
    };
  }
}
