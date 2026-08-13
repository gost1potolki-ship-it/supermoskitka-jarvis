import {
  formatRubAmount,
  uniqueCurrencyAmounts,
} from './money-text.js';
import type {
  PriceIntegrityContext,
  PriceIntegrityReason,
  PriceIntegrityResult,
} from './pricing-types.js';

function fallbackText(context: PriceIntegrityContext): string {
  const amount = formatRubAmount(context.authoritativeTotal);
  if (context.mode === 'PRELIMINARY_ALL_IN') {
    return `Предварительная стоимость по указанным параметрам — ${amount} под ключ.`;
  }
  return `Стоимость изделия по указанным параметрам — ${amount}.`;
}

function decide(
  candidateText: string,
  context: PriceIntegrityContext,
): { accepted: boolean; reason: PriceIntegrityReason } {
  const amounts = uniqueCurrencyAmounts(candidateText);
  if (amounts.length === 0) {
    return { accepted: false, reason: 'missing_total' };
  }
  if (amounts.length > 1) {
    return { accepted: false, reason: 'conflicting_amounts' };
  }
  if (amounts[0] !== context.authoritativeTotal) {
    return { accepted: false, reason: 'wrong_total' };
  }
  return { accepted: true, reason: 'accepted' };
}

/**
 * Jarvis Core money boundary: CalculationEngine total is authoritative.
 * Never asks the LLM to "fix" a wrong price.
 */
export class PriceIntegrityGuard {
  enforce(candidateText: string, context: PriceIntegrityContext): PriceIntegrityResult {
    const candidate = candidateText.trim();
    const decision = decide(candidate, context);
    if (decision.accepted) {
      return {
        accepted: true,
        reason: decision.reason,
        outgoingText: candidate,
        candidateText: candidate,
      };
    }
    return {
      accepted: false,
      reason: decision.reason,
      outgoingText: fallbackText(context),
      candidateText: candidate,
    };
  }
}
