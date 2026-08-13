import type { MeasurementActionDecision, MeasurementActionPolicy } from '../../domain/index.js';

import { evaluateLeadReadiness } from './lead-readiness.js';
import type { OrderMemory } from '../../domain/index.js';

export const DEFAULT_MEASUREMENT_ACTION_POLICY: MeasurementActionPolicy = 'AUTO_WHEN_READY';

export function decideMeasurementAction(
  memory: OrderMemory,
  policy: MeasurementActionPolicy = DEFAULT_MEASUREMENT_ACTION_POLICY,
): MeasurementActionDecision {
  if (policy === 'DISABLED') {
    return 'NOT_READY';
  }

  const readiness = evaluateLeadReadiness(memory);
  if (readiness.status !== 'READY_FOR_MEASUREMENT') {
    return 'NOT_READY';
  }

  if (policy === 'ALWAYS_MANUAL') {
    return 'AWAITING_OWNER_APPROVAL';
  }

  return 'AUTO_ALLOWED';
}
