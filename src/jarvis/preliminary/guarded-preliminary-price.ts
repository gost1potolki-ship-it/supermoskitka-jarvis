import type { CalculationOutcome } from '../../calculation/index.js';
import type { QuoteTrustStatus } from '../../domain/index.js';
import type { OrderMemory } from '../../domain/index.js';

import { computeOrderProfitabilitySnapshot } from './order-profitability.js';
import { computeQuoteInputFingerprintFromTrustedCalculation } from './quote-fingerprint.js';
import type { TrustedPreliminaryCalculationInput } from './trusted-preliminary-calculation.js';

/** Module-private token — not exported. Prevents external construction. */
const PROOF_CREATE_TOKEN = Symbol('TrustedPreliminaryQuoteProof.create');

export type TrustedPreliminaryQuoteFailureCode =
  | 'NEEDS_INPUT'
  | 'NEEDS_SIZE_BASIS'
  | 'TRUSTED_INPUT_REQUIRED'
  | 'CALCULATION_INCOMPLETE';

/**
 * Runtime-branded proof of a trusted legacy calculation.
 * Constructible only with the module-private create token
 * (via createTrustedPreliminaryQuoteProof / test-only helper).
 * No public raw-number / fingerprint factory.
 */
export class TrustedPreliminaryQuoteProof {
  readonly publicTotalRub: number;
  readonly quoteTrustStatus: QuoteTrustStatus;
  readonly inputFingerprint: string;
  readonly calculationVersion: string | undefined;
  readonly priceVersion: string | undefined;

  constructor(
    token: typeof PROOF_CREATE_TOKEN,
    publicTotalRub: number,
    quoteTrustStatus: QuoteTrustStatus,
    inputFingerprint: string,
    calculationVersion: string | undefined,
    priceVersion: string | undefined,
  ) {
    if (token !== PROOF_CREATE_TOKEN) {
      throw new Error('TrustedPreliminaryQuoteProof cannot be constructed directly');
    }
    this.publicTotalRub = publicTotalRub;
    this.quoteTrustStatus = quoteTrustStatus;
    this.inputFingerprint = inputFingerprint;
    this.calculationVersion = calculationVersion;
    this.priceVersion = priceVersion;
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
  /** Required. No memory-fingerprint fallback. */
  trustedInput: TrustedPreliminaryCalculationInput;
}

/**
 * Trusted customer quote from the legacy Calculation Engine total.
 * Actual cost / profitability never changes publicTotalRub.
 *
 * Requires the same trusted normalized input that drove engine.calculate().
 */
export function createTrustedPreliminaryQuoteProof(
  input: CreateTrustedPreliminaryQuoteInput,
): CreateTrustedPreliminaryQuoteResult {
  const { memory, outcome, trustedInput } = input;

  if (trustedInput === undefined) {
    return { ok: false, code: 'TRUSTED_INPUT_REQUIRED' };
  }

  if (outcome.status !== 'calculated' || outcome.total === null || !Number.isFinite(outcome.total)) {
    return { ok: false, code: 'CALCULATION_INCOMPLETE' };
  }

  const inputFingerprint = computeQuoteInputFingerprintFromTrustedCalculation(
    memory,
    trustedInput,
  );

  return {
    ok: true,
    proof: new TrustedPreliminaryQuoteProof(
      PROOF_CREATE_TOKEN,
      outcome.total,
      'TRUSTED_LEGACY_CALCULATION',
      inputFingerprint,
      outcome.calculationVersion,
      outcome.priceVersion,
    ),
  };
}

/** @deprecated Use createTrustedPreliminaryQuoteProof. */
export const createGuardedPreliminaryPrice = createTrustedPreliminaryQuoteProof;

/**
 * @internal Test-only. Not re-exported from preliminary/index.
 * Production orchestration must use createTrustedPreliminaryQuoteProof after engine.calculate().
 */
export function createTrustedPreliminaryQuoteProofForTests(input: {
  publicTotalRub: number;
  inputFingerprint: string;
  calculationVersion?: string;
  priceVersion?: string;
}): TrustedPreliminaryQuoteProof {
  return new TrustedPreliminaryQuoteProof(
    PROOF_CREATE_TOKEN,
    input.publicTotalRub,
    'TRUSTED_LEGACY_CALCULATION',
    input.inputFingerprint,
    input.calculationVersion,
    input.priceVersion,
  );
}

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
