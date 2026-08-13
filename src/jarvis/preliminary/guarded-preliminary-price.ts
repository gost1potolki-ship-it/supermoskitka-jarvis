import type {
  CalculationEngine,
  CalculationOutcome,
  CalculationRequest,
} from '../../calculation/index.js';
import type { QuoteTrustStatus } from '../../domain/index.js';
import type { OrderMemory } from '../../domain/index.js';

import { computeOrderProfitabilitySnapshot } from './order-profitability.js';
import { computeQuoteInputFingerprintFromTrustedCalculation } from './quote-fingerprint.js';
import {
  buildCalculationRequestFromTrustedPreliminaryInput,
  type TrustedPreliminaryCalculationInput,
} from './trusted-preliminary-calculation.js';

/** Module-private token — not exported. Prevents external construction. */
const PROOF_CREATE_TOKEN = Symbol('TrustedPreliminaryQuoteProof.create');

export type TrustedPreliminaryQuoteFailureCode =
  | 'NEEDS_INPUT'
  | 'NEEDS_SIZE_BASIS'
  | 'TRUSTED_INPUT_REQUIRED'
  | 'CALCULATION_INCOMPLETE';

/**
 * Runtime-branded proof of a trusted legacy calculation.
 * Only mintable after calculateTrustedPreliminaryQuote invokes the Calculation Engine.
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

function mintProofFromEngineOutcome(
  memory: OrderMemory,
  trustedInput: TrustedPreliminaryCalculationInput,
  outcome: CalculationOutcome,
): TrustedPreliminaryQuoteProof {
  const inputFingerprint = computeQuoteInputFingerprintFromTrustedCalculation(
    memory,
    trustedInput,
  );
  return new TrustedPreliminaryQuoteProof(
    PROOF_CREATE_TOKEN,
    outcome.total!,
    'TRUSTED_LEGACY_CALCULATION',
    inputFingerprint,
    outcome.calculationVersion,
    outcome.priceVersion,
  );
}

export interface CalculateTrustedPreliminaryQuoteInput {
  engine: CalculationEngine;
  memory: OrderMemory;
  trustedInput: TrustedPreliminaryCalculationInput;
  /** Optional override; defaults to request derived from trustedInput. */
  request?: CalculationRequest;
}

export type CalculateTrustedPreliminaryQuoteResult =
  | {
      ok: true;
      outcome: CalculationOutcome;
      proof: TrustedPreliminaryQuoteProof;
    }
  | {
      ok: true;
      outcome: CalculationOutcome;
      proof?: undefined;
    }
  | {
      ok: false;
      code: TrustedPreliminaryQuoteFailureCode;
      outcome?: CalculationOutcome;
    };

/**
 * Sole production path to a readiness-qualified trusted quote proof.
 * Invokes Calculation Engine itself — callers cannot pass a fabricated outcome.
 */
export async function calculateTrustedPreliminaryQuote(
  input: CalculateTrustedPreliminaryQuoteInput,
): Promise<CalculateTrustedPreliminaryQuoteResult> {
  const { engine, memory, trustedInput } = input;

  if (trustedInput === undefined) {
    return { ok: false, code: 'TRUSTED_INPUT_REQUIRED' };
  }

  const request =
    input.request ?? buildCalculationRequestFromTrustedPreliminaryInput(trustedInput);
  const outcome = await engine.calculate(request);

  if (outcome.status !== 'calculated' || outcome.total === null || !Number.isFinite(outcome.total)) {
    return {
      ok: true,
      outcome,
    };
  }

  return {
    ok: true,
    outcome,
    proof: mintProofFromEngineOutcome(memory, trustedInput, outcome),
  };
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
