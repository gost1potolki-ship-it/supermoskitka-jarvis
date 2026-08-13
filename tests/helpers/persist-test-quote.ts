import type { OrderMemory } from '../../src/domain/index.js';
import {
  computeQuoteInputFingerprintFromMemory,
  PreliminaryQuoteService,
} from '../../src/jarvis/preliminary/index.js';
import { createTrustedPreliminaryQuoteProofForTests } from '../../src/jarvis/preliminary/guarded-preliminary-price.js';

/** Test-only: readiness fixtures without production raw-number proof API. */
export function persistTestQuote(memory: OrderMemory, publicTotalRub: number) {
  const service = new PreliminaryQuoteService();
  return service.persistAfterPreliminaryCalculation({
    memory,
    proof: createTrustedPreliminaryQuoteProofForTests({
      publicTotalRub,
      inputFingerprint: computeQuoteInputFingerprintFromMemory(memory),
    }),
  });
}
