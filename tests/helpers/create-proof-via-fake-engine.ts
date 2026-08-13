import type { OrderMemory } from '../../src/domain/index.js';
import {
  buildTrustedPreliminaryCalculationInput,
  calculateTrustedPreliminaryQuote,
  type TrustedPreliminaryQuoteProof,
} from '../../src/jarvis/preliminary/index.js';
import { FixedTotalCalculationEngine } from './fixed-total-engine.js';

export async function createProofViaFakeEngine(
  memory: OrderMemory,
  totalRub: number,
  deliveryType: 'city' | 'out' | 'pickup' = 'city',
): Promise<
  | { ok: true; proof: TrustedPreliminaryQuoteProof }
  | { ok: false; code: string }
> {
  const built = buildTrustedPreliminaryCalculationInput(memory, { type: deliveryType });
  if (!built.ok) {
    return { ok: false, code: built.code };
  }
  const calculated = await calculateTrustedPreliminaryQuote({
    engine: new FixedTotalCalculationEngine(totalRub),
    memory,
    trustedInput: built.input,
  });
  if (!calculated.ok || !calculated.proof) {
    return { ok: false, code: 'CALCULATION_INCOMPLETE' };
  }
  return { ok: true, proof: calculated.proof };
}
