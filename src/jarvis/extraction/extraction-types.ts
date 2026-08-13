import type { OrderMemory } from '../../domain/index.js';

export type FactExplicitness = 'EXPLICIT' | 'UNCERTAIN' | 'HYPOTHETICAL';

export type ItemProposalOperation = 'CREATE' | 'UPDATE';

export interface FactExtractionContextMessage {
  role: 'customer' | 'ai' | 'human';
  text: string;
  messageId?: string;
}

export interface FactExtractionRequest {
  conversationId: string;
  currentMessage: {
    id: string;
    text: string;
    channel: string;
    timestamp: string;
  };
  memorySnapshot: OrderMemory;
  recentContext: readonly FactExtractionContextMessage[];
}

export interface ExtractedFieldProposal {
  field: string;
  value: unknown;
  explicitness: FactExplicitness;
  evidenceText: string;
  confidence?: number;
}

export interface ExtractedItemProposal {
  operation: ItemProposalOperation;
  targetItemId?: string;
  targetOrdinal?: number;
  facts: ExtractedFieldProposal[];
}

export interface ExtractionIssue {
  code: string;
  message: string;
  path?: string;
}

export interface FactExtractionResult {
  itemProposals: ExtractedItemProposal[];
  customerFacts: ExtractedFieldProposal[];
  fulfillmentFacts: ExtractedFieldProposal[];
  commercialFacts: ExtractedFieldProposal[];
  issues: ExtractionIssue[];
}

export interface FactExtractor {
  extract(request: FactExtractionRequest): Promise<FactExtractionResult>;
}

export class FactExtractionConfigError extends Error {
  readonly code = 'FACT_EXTRACTION_CONFIG_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'FactExtractionConfigError';
  }
}
