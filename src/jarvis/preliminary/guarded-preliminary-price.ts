import type { CalculationOutcome } from '../../calculation/index.js';
import type { QuoteTrustStatus } from '../../domain/index.js';
import type { OrderMemory } from '../../domain/index.js';

import { computeOrderProfitabilitySnapshot } from './order-profitability.js';
import {
  computeQuoteInputFingerprintFromMemory,
  computeQuoteInputFingerprintFromTrustedCalculation,
} from './quote-fingerprint.js';
import {
  buildTrustedPreliminaryCalculationInput,
  type TrustedPreliminaryCalculationInput,
} from './trusted-preliminary-calculation.js';

const PROOF_BRAND = Symbol('TrustedPreliminaryQuoteProof');

export type TrustedPreliminaryQuoteFailureCode =
  | 'NEEDS_INPUT'
  | 'NEEDS_SIZE_BASIS'
  | 'CALCULATION_INCOMPLETE';

export class TrustedPreliminaryQuoteProof {
  declare readonly [PROOF_BRAND]: true;

  private constructor(
    readonly publicTotalRub: number,
    readonly quoteTrustStatus: QuoteTrustStatus,
    readonly inputFingerprint: string,
    readonly calculationVersion: string | undefined,
    readonly priceVersion: string | undefined,
  ) {
    Object.defineProperty(this, PROOF_BRAND, {
      value: true,
      enumerable: false,
    });
  }

  static fromTrustedLegacyCalculation(input: {
    publicTotalRub: number;
    inputFingerprint: string;
    calculationVersion?: string;
    priceVersion?: string;
  }): TrustedPreliminaryQuoteProof {
    return new TrustedPreliminaryQuoteProof(
      input.publicTotalRub,
      'TRUSTED_LEGACY_CALCULATION',
      input.inputFingerprint,
      input.calculationVersion,
      input.priceVersion,
    );
  }
}

export function isTrustedPreliminaryQuoteProof(
  value: unknown,
): value is TrustedPreliminaryQuoteProof {
  return value instanceof TrustedPreliminaryQuoteProof;
}

export type CreateTrustedPreliminaryQuoteResult =
  | { ok: true; proof: TrustedPreliminaryQuoteProof }
  | { ok: false; code: TrustedPreliminaryQuoteFailureCode };

export interface CreateTrustedPreliminaryQuoteInput {
  memory: OrderMemory;
  outcome: CalculationOutcome;
  deliveryType: 'city' | 'out' | 'pickup';
  trustedInput?: TrustedPreliminaryCalculationInput;
}

/**
 * Trusted customer quote from the legacy Calculation Engine total.
 * Actual cost / profitability never changes publicTotalRub.
 */
export function createTrustedPreliminaryQuoteProof(
  input: CreateTrustedPreliminaryQuoteInput,
): CreateTrustedPreliminaryQuoteResult {
  const { memory, outcome, deliveryType } = input;

  if (outcome.status !== 'calculated' || outcome.total === null || !Number.isFinite(outcome.total)) {
    return { ok: false, code: 'CALCULATION_INCOMPLETE' };
  }

  const trustedInput =
    input.trustedInput ??
    (() => {
      const built = buildTrustedPreliminaryCalculationInput(memory, { type: deliveryType });
      return built.ok ? built.input : undefined;
    })();

  const inputFingerprint = trustedInput
    ? computeQuoteInputFingerprintFromTrustedCalculation(memory, trustedInput)
    : computeQuoteInputFingerprintFromMemory(memory, { deliveryType });

  return {
    ok: true,
    proof: TrustedPreliminaryQuoteProof.fromTrustedLegacyCalculation({
      publicTotalRub: outcome.total,
      inputFingerprint,
      calculationVersion: outcome.calculationVersion,
      priceVersion: outcome.priceVersion,
    }),
  };
}

/** @deprecated Use createTrustedPreliminaryQuoteProof. */
export const createGuardedPreliminaryPrice = createTrustedPreliminaryQuoteProof;

export function attachProfitabilityToMemory(
  memory: OrderMemory,
  sellingTotalRub: number,
  deliveryType: 'city' | 'out' | 'pickup',
  computedAt: string,
): OrderMemory {
  return {
    ...memory,
    orderProfitability: computeOrderProfitabilitySnapshot({
      memory,
      sellingTotalRub,
      deliveryType,
      computedAt,
    }),
  };
}
