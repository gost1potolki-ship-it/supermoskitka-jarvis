import type { LeadReadinessStatus, MeasurementActionDecision } from '../../domain/lead-readiness.js';

export interface MeasurementDraftDto {
  conversationId: string;
  memoryRevision: number;
  customer: {
    name?: string;
    phone?: string;
    address?: string;
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
  }>;
  fulfillment: {
    installationRequested?: boolean;
    pickupRequested?: boolean;
    deliveryRequested?: boolean;
    deliveryType?: string;
    deliveryKm?: number;
  };
  preliminaryQuote?: {
    quoteId: string;
    publicTotalRub: number;
  };
}

export interface MeasurementActionDto {
  conversationId: string;
  kind: MeasurementActionDecision;
  readiness: {
    status: LeadReadinessStatus;
    missingCodes: string[];
  };
  draft?: MeasurementDraftDto;
}
