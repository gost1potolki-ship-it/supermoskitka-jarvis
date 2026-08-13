import { createHash, randomUUID } from 'node:crypto';

import {
  PRICING_POLICY_VERSION,
  type OrderMemory,
  type PreliminaryQuoteSnapshot,
} from '../../domain/index.js';

import type { GuardedPreliminaryPrice } from './guarded-preliminary-price.js';

export interface BuildPreliminaryQuoteSnapshotInput {
  memory: OrderMemory;
  guarded: GuardedPreliminaryPrice;
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
  const createdAt = input.createdAt ?? new Date().toISOString();

  return {
    quoteId: generatePreliminaryQuoteId(
      input.guarded.inputFingerprint,
      input.guarded.publicTotalRub,
      createdAt,
    ),
    inputFingerprint: input.guarded.inputFingerprint,
    publicTotalRub: input.guarded.publicTotalRub,
    createdAt,
    pricingPolicyVersion: input.pricingPolicyVersion ?? PRICING_POLICY_VERSION,
    pricingPolicyStatus: input.guarded.pricingPolicyStatus,
    ...(input.guarded.calculationVersion !== undefined
      ? { calculationVersion: input.guarded.calculationVersion }
      : {}),
    ...(input.guarded.priceVersion !== undefined
      ? { priceVersion: input.guarded.priceVersion }
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
        pricingPolicyStatus: snapshot.pricingPolicyStatus,
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
  guarded: GuardedPreliminaryPrice;
  pricingPolicyVersion?: string;
  createdAt?: string;
}

export function createQuoteAfterPreliminaryCalculation(
  input: CreateQuoteAfterPreliminaryCalculationInput,
): { memory: OrderMemory; snapshot: PreliminaryQuoteSnapshot } {
  const snapshot = buildPreliminaryQuoteSnapshot({
    memory: input.memory,
    guarded: input.guarded,
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
