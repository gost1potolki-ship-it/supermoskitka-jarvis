import {
  HARD_GROSS_MARGIN_FLOOR,
  NORMAL_GROSS_MARGIN_TARGET,
} from '../../calculation/actual-cost/actual-cost-config.js';
import { ACTUAL_COST_CATALOG_VERSION } from '../../calculation/actual-cost/actual-cost-catalog-v1.js';
import type {
  CostBasisStatus,
  OrderProfitabilitySnapshot,
  ProfitabilityBand,
} from '../../domain/profitability.js';

export type { CostBasisStatus, OrderProfitabilitySnapshot, ProfitabilityBand };

export const GREEN_GROSS_MARGIN_PERCENT = NORMAL_GROSS_MARGIN_TARGET * 100;
export const YELLOW_GROSS_MARGIN_FLOOR_PERCENT = HARD_GROSS_MARGIN_FLOOR * 100;

export interface ComputeProfitabilityInput {
  sellingTotalRub: number;
  costBasisStatus: CostBasisStatus;
  actualDirectCostRub?: number;
  knownDirectCostSubtotalRub?: number;
  missingCostReasons?: string[];
  actualCostCatalogVersion?: string;
  computedAt?: string;
}

function roundPercent(value: number): number {
  return value;
}

export function classifyProfitabilityBand(grossMarginPercent: number): ProfitabilityBand {
  if (grossMarginPercent >= GREEN_GROSS_MARGIN_PERCENT) {
    return 'GREEN';
  }
  if (grossMarginPercent >= YELLOW_GROSS_MARGIN_FLOOR_PERCENT) {
    return 'YELLOW';
  }
  return 'RED';
}

/**
 * Internal analytics only. Never mutates customer selling price.
 * Exact margin/markup are emitted only when costBasisStatus is EXACT.
 */
export function computeOrderProfitability(
  input: ComputeProfitabilityInput,
): OrderProfitabilitySnapshot {
  const computedAt = input.computedAt ?? new Date().toISOString();
  const catalogVersion = input.actualCostCatalogVersion ?? ACTUAL_COST_CATALOG_VERSION;
  const missingCostReasons =
    input.missingCostReasons && input.missingCostReasons.length > 0
      ? [...input.missingCostReasons]
      : undefined;

  if (input.costBasisStatus !== 'EXACT') {
    return {
      costBasisStatus: input.costBasisStatus,
      sellingTotalRub: input.sellingTotalRub,
      ...(input.knownDirectCostSubtotalRub !== undefined
        ? { knownDirectCostSubtotalRub: input.knownDirectCostSubtotalRub }
        : {}),
      profitabilityBand: 'UNAVAILABLE',
      ...(missingCostReasons !== undefined ? { missingCostReasons } : {}),
      actualCostCatalogVersion: catalogVersion,
      computedAt,
    };
  }

  const actualDirectCostRub = input.actualDirectCostRub;
  if (
    actualDirectCostRub === undefined ||
    !Number.isFinite(actualDirectCostRub) ||
    actualDirectCostRub <= 0 ||
    !Number.isFinite(input.sellingTotalRub) ||
    input.sellingTotalRub <= 0
  ) {
    return {
      costBasisStatus: 'UNAVAILABLE',
      sellingTotalRub: input.sellingTotalRub,
      profitabilityBand: 'UNAVAILABLE',
      missingCostReasons: missingCostReasons ?? ['EXACT_DIRECT_COST_UNPROVEN'],
      actualCostCatalogVersion: catalogVersion,
      computedAt,
    };
  }

  const grossProfitRub = input.sellingTotalRub - actualDirectCostRub;
  const grossMarginPercent = roundPercent((grossProfitRub / input.sellingTotalRub) * 100);
  const markupPercent = roundPercent((grossProfitRub / actualDirectCostRub) * 100);

  return {
    costBasisStatus: 'EXACT',
    sellingTotalRub: input.sellingTotalRub,
    actualDirectCostRub,
    knownDirectCostSubtotalRub: input.knownDirectCostSubtotalRub ?? actualDirectCostRub,
    grossProfitRub,
    grossMarginPercent,
    markupPercent,
    profitabilityBand: classifyProfitabilityBand(grossMarginPercent),
    ...(missingCostReasons !== undefined ? { missingCostReasons } : {}),
    actualCostCatalogVersion: catalogVersion,
    computedAt,
  };
}
