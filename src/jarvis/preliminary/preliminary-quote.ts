import { createHash, randomUUID } from 'node:crypto';

import {
  PRICING_POLICY_VERSION,
  type OrderMemory,
  type PreliminaryQuoteSnapshot,
} from '../../domain/index.js';

import { computeQuoteInputFingerprintFromMemory } from './quote-fingerprint.js';

export interface BuildPreliminaryQuoteSnapshotInput {
  memory: OrderMemory;
  publicTotalRub: number;
  pricingPolicyVersion?: string;
  calculationVersion?: string;
  priceVersion?: string;
  createdAt?: string;
  inputFingerprint?: string;
}

export function generatePreliminaryQuoteId(
  fingerprint: string,
  publicTotalRub: number,
  createdAt: string,
): string {
  const digest = createHash('sha256')
    .update(`${fingerprint}|${publicTotalRub}|${createdAt}`)
    .digest('hex')
    .slice(0, 16);
  return `pq_${digest}`;
}

export function buildPreliminaryQuoteSnapshot(
  input: BuildPreliminaryQuoteSnapshotInput,
): PreliminaryQuoteSnapshot {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const inputFingerprint =
    input.inputFingerprint ?? computeQuoteInputFingerprintFromMemory(input.memory);

  return {
    quoteId: generatePreliminaryQuoteId(inputFingerprint, input.publicTotalRub, createdAt),
    inputFingerprint,
    publicTotalRub: input.publicTotalRub,
    createdAt,
    pricingPolicyVersion: input.pricingPolicyVersion ?? PRICING_POLICY_VERSION,
    marginGuardPassed: true,
    ...(input.calculationVersion !== undefined ? { calculationVersion: input.calculationVersion } : {}),
    ...(input.priceVersion !== undefined ? { priceVersion: input.priceVersion } : {}),
  };
}

export function attachPreliminaryQuote(
  memory: OrderMemory,
  snapshot: PreliminaryQuoteSnapshot,
  now: string = new Date().toISOString(),
): OrderMemory {
  const acceptedStillValid =
    memory.acceptedPreliminaryQuoteId !== undefined &&
    memory.acceptedPreliminaryQuoteId === memory.preliminaryQuote?.quoteId &&
    memory.preliminaryQuote.inputFingerprint === snapshot.inputFingerprint;

  return {
    ...memory,
    preliminaryQuote: snapshot,
    acceptedPreliminaryQuoteId: acceptedStillValid
      ? memory.acceptedPreliminaryQuoteId
      : undefined,
    updatedAt: now,
  };
}

export interface CreateQuoteAfterPreliminaryCalculationInput {
  memory: OrderMemory;
  publicTotalRub: number;
  pricingPolicyVersion?: string;
  calculationVersion?: string;
  priceVersion?: string;
  inputFingerprint?: string;
  createdAt?: string;
}

export function createQuoteAfterPreliminaryCalculation(
  input: CreateQuoteAfterPreliminaryCalculationInput,
): { memory: OrderMemory; snapshot: PreliminaryQuoteSnapshot } {
  const snapshot = buildPreliminaryQuoteSnapshot({
    memory: input.memory,
    publicTotalRub: input.publicTotalRub,
    pricingPolicyVersion: input.pricingPolicyVersion,
    calculationVersion: input.calculationVersion,
    priceVersion: input.priceVersion,
    inputFingerprint: input.inputFingerprint,
    createdAt: input.createdAt,
  });
  return {
    snapshot,
    memory: attachPreliminaryQuote(input.memory, snapshot, input.createdAt),
  };
}

export function createUniquePreliminaryQuoteId(): string {
  return `pq_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}
