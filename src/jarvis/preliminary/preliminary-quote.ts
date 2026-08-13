import { createHash, randomUUID } from 'node:crypto';

import {
  PRICING_POLICY_VERSION,
  type OrderMemory,
  type PreliminaryQuoteSnapshot,
} from '../../domain/index.js';

import {
  isTrustedPreliminaryQuoteProof,
  type TrustedPreliminaryQuoteProof,
} from './guarded-preliminary-price.js';

export interface BuildPreliminaryQuoteSnapshotInput {
  memory: OrderMemory;
  proof: TrustedPreliminaryQuoteProof;
  pricingPolicyVersion?: string;
  createdAt?: string;
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
  if (!isTrustedPreliminaryQuoteProof(input.proof)) {
    throw new Error('arbitrary object cannot create trusted readiness quote');
  }

  const createdAt = input.createdAt ?? new Date().toISOString();

  return {
    quoteId: generatePreliminaryQuoteId(
      input.proof.inputFingerprint,
      input.proof.publicTotalRub,
      createdAt,
    ),
    inputFingerprint: input.proof.inputFingerprint,
    publicTotalRub: input.proof.publicTotalRub,
    createdAt,
    pricingPolicyVersion: input.pricingPolicyVersion ?? PRICING_POLICY_VERSION,
    quoteTrustStatus: input.proof.quoteTrustStatus,
    ...(input.proof.calculationVersion !== undefined
      ? { calculationVersion: input.proof.calculationVersion }
      : {}),
    ...(input.proof.priceVersion !== undefined
      ? { priceVersion: input.proof.priceVersion }
      : {}),
  };
}

export function attachPreliminaryQuote(
  memory: OrderMemory,
  snapshot: PreliminaryQuoteSnapshot,
  now: string = new Date().toISOString(),
): OrderMemory {
  const existing = memory.preliminaryQuote;
  const equivalentExisting =
    existing !== undefined &&
    existing.inputFingerprint === snapshot.inputFingerprint &&
    existing.publicTotalRub === snapshot.publicTotalRub;

  const nextSnapshot = equivalentExisting
    ? {
        ...existing,
        quoteTrustStatus: snapshot.quoteTrustStatus,
        pricingPolicyVersion: snapshot.pricingPolicyVersion,
        ...(snapshot.calculationVersion !== undefined
          ? { calculationVersion: snapshot.calculationVersion }
          : {}),
        ...(snapshot.priceVersion !== undefined ? { priceVersion: snapshot.priceVersion } : {}),
      }
    : snapshot;

  const acceptedStillValid =
    memory.acceptedPreliminaryQuoteId !== undefined &&
    memory.acceptedPreliminaryQuoteId === nextSnapshot.quoteId &&
    existing?.inputFingerprint === nextSnapshot.inputFingerprint;

  return {
    ...memory,
    preliminaryQuote: nextSnapshot,
    acceptedPreliminaryQuoteId: acceptedStillValid
      ? memory.acceptedPreliminaryQuoteId
      : equivalentExisting
        ? memory.acceptedPreliminaryQuoteId
        : undefined,
    updatedAt: now,
  };
}

export interface CreateQuoteAfterPreliminaryCalculationInput {
  memory: OrderMemory;
  proof: TrustedPreliminaryQuoteProof;
  pricingPolicyVersion?: string;
  createdAt?: string;
}

export function createQuoteAfterPreliminaryCalculation(
  input: CreateQuoteAfterPreliminaryCalculationInput,
): { memory: OrderMemory; snapshot: PreliminaryQuoteSnapshot } {
  const snapshot = buildPreliminaryQuoteSnapshot({
    memory: input.memory,
    proof: input.proof,
    pricingPolicyVersion: input.pricingPolicyVersion,
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
