import type { CostBasisStatus, ProfitabilityBand } from '../../domain/profitability.js';
import type { LeadReadinessStatus } from '../../domain/lead-readiness.js';
import type { MeasurementActionDecision } from '../../domain/lead-readiness.js';

export interface ConversationOrderStateDto {
  conversationId: string;
  memoryRevision: number;

  customer: {
    name?: string;
    phone?: string;
    address?: string;
    customerType?: string;
  };

  items: Array<{
    localItemId: string;
    productType?: string;
    quantity?: number;
    widthMm?: number;
    heightMm?: number;
    measurementBasis?: string;
    mesh?: string;
    profile?: string;
    profileColor?: string;
    ral?: string;
    finish?: string;
    fastening?: string;
    opening?: string;
    comment?: string;
  }>;

  preliminaryQuote?: {
    quoteId: string;
    publicTotalRub: number;
    current: boolean;
    accepted: boolean;
  };

  measurementAgreed?: boolean;

  readiness: {
    status: LeadReadinessStatus;
    missingCodes: string[];
  };

  measurementAction: {
    kind: MeasurementActionDecision;
  };

  profitability?: {
    costBasisStatus: CostBasisStatus;
    grossProfitRub?: number;
    grossMarginPercent?: number;
    markupPercent?: number;
    profitabilityBand: ProfitabilityBand;
  };
}
