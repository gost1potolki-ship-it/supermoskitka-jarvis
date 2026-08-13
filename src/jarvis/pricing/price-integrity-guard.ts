import {
  formatRubAmount,
  uniqueCurrencyAmounts,
} from './money-text.js';
import type {
  CalculationTurnState,
  PriceIntegrityContext,
  PriceIntegrityReason,
  PriceIntegrityResult,
} from './pricing-types.js';

function calculatedFallbackText(context: PriceIntegrityContext): string {
  const amount = formatRubAmount(context.authoritativeTotal);
  if (context.mode === 'PRELIMINARY_ALL_IN') {
    return `Предварительная стоимость по указанным параметрам — ${amount} под ключ.`;
  }
  return `Стоимость изделия по указанным параметрам — ${amount}.`;
}

function nonCalculatedFallback(kind: Exclude<CalculationTurnState['kind'], 'none' | 'calculated'>): string {
  if (kind === 'needs_input') {
    return 'Для расчёта нужно уточнить недостающие параметры.';
  }
  if (kind === 'unsupported') {
    return 'Автоматический расчёт этой конфигурации сейчас недоступен.';
  }
  return 'Не удалось выполнить расчёт. Уточните параметры заказа.';
}

function decideCalculated(
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
 * After a non-calculated tool outcome, any currency amount is forbidden.
 */
export class PriceIntegrityGuard {
  enforce(candidateText: string, context: PriceIntegrityContext): PriceIntegrityResult {
    const candidate = candidateText.trim();
    const decision = decideCalculated(candidate, context);
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
      outgoingText: calculatedFallbackText(context),
      candidateText: candidate,
    };
  }

  /** Apply money rules for the last calculate_order outcome of the turn. */
  enforceForTurn(
    candidateText: string,
    turn: CalculationTurnState,
  ): PriceIntegrityResult | null {
    if (turn.kind === 'none') {
      return null;
    }
    if (turn.kind === 'calculated') {
      return this.enforce(candidateText, {
        mode: turn.mode,
        authoritativeTotal: turn.total,
      });
    }

    const candidate = candidateText.trim();
    const amounts = uniqueCurrencyAmounts(candidate);
    if (amounts.length === 0) {
      return {
        accepted: true,
        reason: 'accepted',
        outgoingText: candidate,
        candidateText: candidate,
      };
    }
    return {
      accepted: false,
      reason: 'price_not_allowed',
      outgoingText: nonCalculatedFallback(turn.kind),
      candidateText: candidate,
    };
  }
}
