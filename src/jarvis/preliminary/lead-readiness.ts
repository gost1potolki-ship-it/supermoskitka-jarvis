import { getFactValue, type LeadReadiness, type OrderMemory } from '../../domain/index.js';

import { computeQuoteInputFingerprintFromMemory } from './quote-fingerprint.js';
import { resolvePreliminaryInputs } from './preliminary-input.js';

export function evaluateLeadReadiness(memory: OrderMemory): LeadReadiness {
  const blockingCodes = new Set<LeadReadiness['blockingCodes'][number]>();

  if (memory.items.length === 0) {
    blockingCodes.add('PRODUCT_MISSING');
  }

  const resolved = resolvePreliminaryInputs(memory);
  for (const source of resolved.blocking) {
    if (source === 'NEEDS_INPUT') {
      blockingCodes.add('NEEDS_INPUT');
    }
    if (source === 'NEEDS_SIZE_BASIS') {
      blockingCodes.add('NEEDS_SIZE_BASIS');
    }
  }

  for (const item of memory.items) {
    if (getFactValue(item.productType) === undefined) {
      blockingCodes.add('PRODUCT_MISSING');
    }
  }

  if (!memory.preliminaryQuote) {
    blockingCodes.add('QUOTE_MISSING');
  } else {
    const currentFingerprint = computeQuoteInputFingerprintFromMemory(memory);
    if (memory.preliminaryQuote.inputFingerprint !== currentFingerprint) {
      blockingCodes.add('QUOTE_STALE');
    }
  }

  if (getFactValue(memory.commercial?.preliminaryPriceAccepted) !== true) {
    blockingCodes.add('PRICE_NOT_ACCEPTED');
  } else if (
    memory.preliminaryQuote &&
    memory.acceptedPreliminaryQuoteId !== memory.preliminaryQuote.quoteId
  ) {
    blockingCodes.add('QUOTE_STALE');
  }

  if (getFactValue(memory.commercial?.measurementAgreed) !== true) {
    blockingCodes.add('MEASUREMENT_NOT_AGREED');
  }

  if (getFactValue(memory.customer?.phone) === undefined) {
    blockingCodes.add('CONTACT_MISSING');
  }

  if (getFactValue(memory.customer?.address) === undefined) {
    blockingCodes.add('ADDRESS_MISSING');
  }

  const codes = [...blockingCodes];
  return {
    status: codes.length === 0 ? 'READY_FOR_MEASUREMENT' : 'NOT_READY',
    blockingCodes: codes,
  };
}
