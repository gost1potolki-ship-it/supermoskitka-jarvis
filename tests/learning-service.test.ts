import { LearningService } from '../src/knowledge/index.js';
import type { KnowledgeRule } from '../src/knowledge/types.js';
import { describe, expect, it } from 'vitest';

function proposedRule() {
  return {
    title: 'Не обещать рулонные сетки',
    category: 'products' as const,
    condition: 'клиент спрашивает про рулонные сетки',
    instruction: 'Сообщить, что рулонные сетки временно не изготавливаются.',
    tags: ['rollup'],
  };
}

describe('LearningService', () => {
  const service = new LearningService();

  it('LEARN-1 owner correction creates pending suggestion', () => {
    const suggestion = service.createSuggestionFromCorrection({
      conversationId: 'conv-1',
      sourceMessageIds: ['msg-1'],
      problem: 'Jarvis пообещал рулонную сетку',
      jarvisAnswer: 'Сделаем рулонную на следующей неделе',
      ownerCorrection: 'Рулонные временно не делаем',
      proposedRule: proposedRule(),
      suggestionId: 'sug-1',
      createdAt: '2026-08-12T12:00:00.000Z',
    });

    expect(suggestion.status).toBe('pending');
    expect(suggestion.suggestionId).toBe('sug-1');
  });

  it('LEARN-2 pending suggestion does not become an approved rule by itself', () => {
    const suggestion = service.createSuggestionFromCorrection({
      sourceMessageIds: ['msg-1'],
      problem: 'ошибка',
      ownerCorrection: 'исправление',
      proposedRule: proposedRule(),
    });

    expect(suggestion.status).toBe('pending');
    expect(suggestion.resultingRuleId).toBeUndefined();
  });

  it('LEARN-3/4 approve creates approved rule with learning-correction source', () => {
    const pending = service.createSuggestionFromCorrection({
      conversationId: 'conv-9',
      sourceMessageIds: ['msg-1'],
      problem: 'ошибка',
      ownerCorrection: 'исправление',
      proposedRule: proposedRule(),
      suggestionId: 'sug-approve',
    });

    const result = service.approveSuggestion({
      suggestion: pending,
      reviewedAt: '2026-08-12T13:00:00.000Z',
      ruleId: 'SM-LEARN-TEST',
    });

    expect(result.suggestion.status).toBe('approved');
    expect(result.rule.status).toBe('approved');
    expect(result.rule.id).toBe('SM-LEARN-TEST');
    expect(result.rule.versions[0]?.source.type).toBe('learning-correction');
    expect(result.rule.versions[0]?.source.reference).toBe('conv-9');
    expect(result.suggestion.resultingRuleId).toBe('SM-LEARN-TEST');
  });

  it('LEARN-5 reject does not create/change active knowledge', () => {
    const pending = service.createSuggestionFromCorrection({
      sourceMessageIds: ['msg-1'],
      problem: 'ошибка',
      ownerCorrection: 'исправление',
      proposedRule: proposedRule(),
    });

    const rejected = service.rejectSuggestion({
      suggestion: pending,
      reviewNote: 'не подходит',
    });

    expect(rejected.status).toBe('rejected');
    expect(rejected.resultingRuleId).toBeUndefined();
  });

  it('LEARN-6 cannot approve an already rejected suggestion', () => {
    const pending = service.createSuggestionFromCorrection({
      sourceMessageIds: ['msg-1'],
      problem: 'ошибка',
      ownerCorrection: 'исправление',
      proposedRule: proposedRule(),
    });
    const rejected = service.rejectSuggestion({ suggestion: pending });

    expect(() => service.approveSuggestion({ suggestion: rejected })).toThrow(
      /Cannot approve a rejected/,
    );
  });

  it('LEARN-7 approve of existing rule keeps previous versions', () => {
    const existing: KnowledgeRule = {
      id: 'SM-EXISTING',
      title: 'Old title',
      category: 'products',
      status: 'approved',
      activeVersion: 1,
      tags: ['old'],
      versions: [
        {
          version: 1,
          condition: 'old condition',
          instruction: 'old instruction',
          source: { type: 'owner', reference: 'business-audit-2026' },
          createdAt: '2026-08-01T00:00:00.000Z',
          approvedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    };

    const pending = service.createSuggestionFromCorrection({
      sourceMessageIds: ['msg-2'],
      problem: 'нужна новая версия',
      ownerCorrection: 'обновить инструкцию',
      proposedRule: {
        title: 'New title',
        category: 'products',
        condition: 'new condition',
        instruction: 'new instruction',
        tags: ['new'],
      },
    });

    const result = service.approveSuggestion({
      suggestion: pending,
      existingRule: existing,
      reviewedAt: '2026-08-12T14:00:00.000Z',
    });

    expect(result.rule.versions).toHaveLength(2);
    expect(result.rule.versions[0]?.instruction).toBe('old instruction');
    expect(result.rule.activeVersion).toBe(2);
    expect(result.rule.versions[1]?.source.type).toBe('learning-correction');
  });
});
