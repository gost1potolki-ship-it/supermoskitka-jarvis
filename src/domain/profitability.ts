export type CostBasisStatus = 'EXACT' | 'PARTIAL' | 'UNAVAILABLE';

export type ProfitabilityBand = 'GREEN' | 'YELLOW' | 'RED' | 'UNAVAILABLE';

export interface OrderProfitabilitySnapshot {
  costBasisStatus: CostBasisStatus;
  sellingTotalRub: number;
  actualDirectCostRub?: number;
  knownDirectCostSubtotalRub?: number;
  grossProfitRub?: number;
  grossMarginPercent?: number;
  markupPercent?: number;
  profitabilityBand: ProfitabilityBand;
  missingCostReasons?: string[];
  actualCostCatalogVersion: string;
  computedAt: string;
}
