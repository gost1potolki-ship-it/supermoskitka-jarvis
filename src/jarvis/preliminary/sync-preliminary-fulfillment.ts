import type { FactSource, OrderMemory } from '../../domain/index.js';

import { applyFulfillmentFact } from '../memory/apply-fulfillment-fact.js';

export function syncPreliminaryFulfillmentFacts(
  memory: OrderMemory,
  deliveryType: 'city' | 'out' | 'pickup',
  source: FactSource,
): OrderMemory {
  let next = memory;

  if (deliveryType === 'pickup') {
    next = applyFulfillmentFact(next, {
      field: 'pickupRequested',
      value: true,
      source,
    }).memory;
    next = applyFulfillmentFact(next, {
      field: 'deliveryType',
      value: 'pickup',
      source,
    }).memory;
    return next;
  }

  next = applyFulfillmentFact(next, {
    field: 'deliveryRequested',
    value: true,
    source,
    }).memory;
  next = applyFulfillmentFact(next, {
    field: 'installationRequested',
    value: true,
    source,
  }).memory;
  next = applyFulfillmentFact(next, {
    field: 'deliveryType',
    value: deliveryType,
    source,
  }).memory;

  return next;
}

/** @internal test helper */
export function preliminaryQuotePersistSource(now: string): FactSource {
  return {
    sourceMessageId: 'preliminary-quote',
    sourceChannel: 'unknown',
    sourceTimestamp: now,
  };
}
