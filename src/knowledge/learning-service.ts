import { randomUUID } from 'node:crypto';

import type { LearningSuggestion, ProposedKnowledgeRule } from './learning-types.js';
import type { KnowledgeRule, KnowledgeRuleVersion } from './types.js';

export interface CreateSuggestionInput {
  conversationId?: string;
  sourceMessageIds: string[];
  problem: string;
  jarvisAnswer?: string;
  ownerCorrection: string;
  proposedRule: ProposedKnowledgeRule;
  suggestionId?: string;
  createdAt?: string;
}

export interface ApproveSuggestionInput {
  suggestion: LearningSuggestion;
  existingRule?: KnowledgeRule;
  ruleId?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface ApproveSuggestionResult {
  suggestion: LearningSuggestion;
  rule: KnowledgeRule;
}

export interface RejectSuggestionInput {
  suggestion: LearningSuggestion;
  reviewedAt?: string;
  reviewNote?: string;
}

export class LearningServiceError extends Error {
  readonly code = 'LEARNING_SERVICE_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'LearningServiceError';
  }
}

export class LearningService {
  createSuggestionFromCorrection(input: CreateSuggestionInput): LearningSuggestion {
    if (input.sourceMessageIds.length === 0) {
      throw new LearningServiceError('sourceMessageIds must not be empty');
    }
    if (input.ownerCorrection.trim() === '') {
      throw new LearningServiceError('ownerCorrection must not be empty');
    }

    return {
      suggestionId: input.suggestionId ?? randomUUID(),
      status: 'pending',
      ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
      sourceMessageIds: [...input.sourceMessageIds],
      problem: input.problem,
      ...(input.jarvisAnswer !== undefined ? { jarvisAnswer: input.jarvisAnswer } : {}),
      ownerCorrection: input.ownerCorrection,
      proposedRule: {
        ...input.proposedRule,
        tags: [...input.proposedRule.tags],
      },
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
  }

  approveSuggestion(input: ApproveSuggestionInput): ApproveSuggestionResult {
    const { suggestion } = input;
    if (suggestion.status === 'rejected') {
      throw new LearningServiceError('Cannot approve a rejected learning suggestion');
    }
    if (suggestion.status === 'approved') {
      throw new LearningServiceError('Learning suggestion is already approved');
    }

    const reviewedAt = input.reviewedAt ?? new Date().toISOString();
    const ruleId =
      input.existingRule?.id ??
      input.ruleId ??
      suggestion.resultingRuleId ??
      `SM-LEARN-${suggestion.suggestionId.slice(0, 8)}`;

    const newVersionNumber = input.existingRule
      ? Math.max(...input.existingRule.versions.map((version) => version.version)) + 1
      : 1;

    const version: KnowledgeRuleVersion = {
      version: newVersionNumber,
      condition: suggestion.proposedRule.condition,
      instruction: suggestion.proposedRule.instruction,
      source: {
        type: 'learning-correction',
        ...(suggestion.conversationId !== undefined
          ? { reference: suggestion.conversationId }
          : {}),
        note: suggestion.ownerCorrection,
      },
      createdAt: reviewedAt,
      approvedAt: reviewedAt,
      ...(suggestion.proposedRule.responseTemplate !== undefined
        ? { responseTemplate: suggestion.proposedRule.responseTemplate }
        : {}),
    };

    const rule: KnowledgeRule = input.existingRule
      ? {
          ...input.existingRule,
          status: 'approved',
          activeVersion: newVersionNumber,
          versions: [...input.existingRule.versions, version],
          title: suggestion.proposedRule.title,
          category: suggestion.proposedRule.category,
          tags: [...suggestion.proposedRule.tags],
        }
      : {
          id: ruleId,
          title: suggestion.proposedRule.title,
          category: suggestion.proposedRule.category,
          status: 'approved',
          activeVersion: 1,
          versions: [version],
          tags: [...suggestion.proposedRule.tags],
        };

    const approvedSuggestion: LearningSuggestion = {
      ...suggestion,
      status: 'approved',
      reviewedAt,
      resultingRuleId: rule.id,
      ...(input.reviewNote !== undefined ? { reviewNote: input.reviewNote } : {}),
    };

    return { suggestion: approvedSuggestion, rule };
  }

  rejectSuggestion(input: RejectSuggestionInput): LearningSuggestion {
    if (input.suggestion.status !== 'pending') {
      throw new LearningServiceError('Only pending learning suggestions can be rejected');
    }

    return {
      ...input.suggestion,
      status: 'rejected',
      reviewedAt: input.reviewedAt ?? new Date().toISOString(),
      ...(input.reviewNote !== undefined ? { reviewNote: input.reviewNote } : {}),
    };
  }
}
