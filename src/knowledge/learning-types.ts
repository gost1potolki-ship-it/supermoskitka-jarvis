import type { KnowledgeRuleCategory } from './types.js';

export type LearningSuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface ProposedKnowledgeRule {
  title: string;
  category: KnowledgeRuleCategory;
  condition: string;
  instruction: string;
  responseTemplate?: string;
  tags: string[];
}

export interface LearningSuggestion {
  suggestionId: string;
  status: LearningSuggestionStatus;
  conversationId?: string;
  sourceMessageIds: string[];
  problem: string;
  jarvisAnswer?: string;
  ownerCorrection: string;
  proposedRule: ProposedKnowledgeRule;
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;
  resultingRuleId?: string;
}
