import { createHash } from 'node:crypto';

import type { MeasurementSubmissionV1, OrderMemory } from '../../domain/index.js';
import { buildMeasurementDraft } from '../../jarvis/preliminary/index.js';

const HASH_PREFIX_LENGTH = 32;

/** jarvis_ + first 32 lowercase hex characters of SHA-256(UTF-8 conversationId). */
export function createJarvisMeasurementSubmissionId(conversationId: string): string {
  const digest = createHash('sha256').update(conversationId, 'utf8').digest('hex');
  return `jarvis_${digest.slice(0, HASH_PREFIX_LENGTH)}`;
}

function compactItemSummary(memory: OrderMemory): string {
  if (memory.items.length === 0) {
    throw new TypeError('Current measurement draft requires at least one item');
  }
  const draft = buildMeasurementDraft(memory);
  const parts = draft.items.map((item) => {
    const quantity = item.quantity ?? 1;
    const product = item.productType ?? 'изделие';
    return `${quantity} × ${product}`;
  });
  return parts.join('; ');
}

export function buildTrustedJarvisMeasurementSubmission(
  memory: OrderMemory,
): MeasurementSubmissionV1 {
  const revision = memory.revision;
  const quote = memory.preliminaryQuote;
  if (!Number.isInteger(revision) || revision === undefined || revision < 1) {
    throw new TypeError('Persisted memory revision is required');
  }
  if (!quote || quote.quoteTrustStatus !== 'TRUSTED_LEGACY_CALCULATION') {
    throw new TypeError('Current trusted preliminary quote is required');
  }

  const draft = buildMeasurementDraft(memory);
  if (!draft.customer.phone?.trim() || !draft.customer.address?.trim()) {
    throw new TypeError('Current measurement draft requires phone and address');
  }

  const itemSummary = compactItemSummary(memory);
  return {
    submissionId: createJarvisMeasurementSubmissionId(memory.conversationId),
    source: 'JARVIS',
    customer: {
      ...(draft.customer.name?.trim() ? { name: draft.customer.name.trim() } : {}),
      phone: draft.customer.phone.trim(),
      address: draft.customer.address.trim(),
    },
    itemSummary,
    preliminaryTotalRub: quote.publicTotalRub,
    payerType: 'CUSTOMER',
    jarvis: {
      conversationId: memory.conversationId,
      memoryRevision: revision,
      quoteId: quote.quoteId,
    },
  };
}
