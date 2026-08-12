import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  KnowledgeBase,
  KnowledgeValidationError,
  buildKnowledgeRules,
  getActiveRuleVersion,
  loadKnowledgeBase,
  loadRegressionCases,
  parseKnowledgeRule,
} from '../src/knowledge/index.js';
import { describe, expect, it } from 'vitest';

const knowledgeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../knowledge');

describe('Knowledge Base loader', () => {
  it('KB-1 loads YAML successfully', async () => {
    const kb = await loadKnowledgeBase(knowledgeRoot);
    expect(kb.getAllRules().length).toBeGreaterThan(0);
  });

  it('KB-2 all rule IDs are unique', async () => {
    const kb = await loadKnowledgeBase(knowledgeRoot);
    const ids = kb.getAllRules().map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('KB-3 every rule has an existing activeVersion', async () => {
    const kb = await loadKnowledgeBase(knowledgeRoot);
    for (const rule of kb.getAllRules()) {
      expect(() => getActiveRuleVersion(rule)).not.toThrow();
    }
  });

  it('KB-4 getApprovedRules excludes draft and rejected', () => {
    const approved = parseKnowledgeRule({
      id: 'TMP-APPROVED',
      title: 'Approved',
      category: 'sales',
      status: 'approved',
      activeVersion: 1,
      tags: [],
      versions: [
        {
          version: 1,
          condition: 'c',
          instruction: 'i',
          source: { type: 'owner' },
          createdAt: '2026-08-12T00:00:00.000Z',
        },
      ],
    });
    const draft = {
      ...approved,
      id: 'TMP-DRAFT',
      status: 'draft' as const,
    };
    const rejected = {
      ...approved,
      id: 'TMP-REJECTED',
      status: 'rejected' as const,
    };

    const kb = new KnowledgeBase([approved, draft, rejected]);
    expect(kb.getApprovedRules().map((rule) => rule.id)).toEqual(['TMP-APPROVED']);
  });

  it('KB-5 getActiveRuleVersion returns the active version', async () => {
    const kb = await loadKnowledgeBase(knowledgeRoot);
    const rule = kb.getRuleById('SM-SALES-003');
    expect(rule).toBeDefined();
    if (!rule) {
      return;
    }
    expect(getActiveRuleVersion(rule).version).toBe(rule.activeVersion);
    expect(getActiveRuleVersion(rule).instruction).toContain('Крыло');
  });

  it('KB-6 SM-SAFE-001 exists and is approved', async () => {
    const kb = await loadKnowledgeBase(knowledgeRoot);
    const rule = kb.getRuleById('SM-SAFE-001');
    expect(rule?.status).toBe('approved');
    expect(getActiveRuleVersion(rule!).responseTemplate).toContain('не защитная решётка');
  });

  it('KB-7 SM-SALES-003 proposes Крыло for small orders', async () => {
    const kb = await loadKnowledgeBase(knowledgeRoot);
    const rule = kb.getRuleById('SM-SALES-003');
    const active = getActiveRuleVersion(rule!);
    expect(active.condition).toContain('1–2 обычные рамочные сетки');
    expect(active.instruction).toContain('Крыло');
    expect(active.responseTemplate).toContain('Крыло');
  });

  it('KB-8 SM-PROD-032 tracks finish changes', async () => {
    const kb = await loadKnowledgeBase(knowledgeRoot);
    const rule = kb.getRuleById('SM-PROD-032');
    const active = getActiveRuleVersion(rule!);
    expect(rule?.status).toBe('approved');
    expect(active.instruction).toContain('муар');
    expect(active.instruction).toContain('глянец');
    expect(active.source).toEqual({
      type: 'real-dialogue',
      reference: 'ral-8028-muar-to-gloss',
    });
  });

  it('KB-COLOR-1 SM-PROD-030 active version equates gray/anthracite/RAL 7016', async () => {
    const kb = await loadKnowledgeBase(knowledgeRoot);
    const rule = kb.getRuleById('SM-PROD-030');
    expect(rule?.activeVersion).toBe(2);
    expect(rule?.versions).toHaveLength(2);
    const active = getActiveRuleVersion(rule!);
    expect(active.instruction).toMatch(/серый/i);
    expect(active.instruction).toMatch(/антрацит/i);
    expect(active.instruction).toMatch(/gray/i);
    expect(active.instruction).toMatch(/anthracite/i);
    expect(active.instruction).toMatch(/RAL 7016/);
    expect(active.instruction).toMatch(/одному цвету/);
    expect(active.source).toEqual({
      type: 'owner',
      reference: 'owner-clarification-2026-08-12-gray-7016',
    });
  });

  it('KB-PLISSE-1 SM-PROD-008 approves PLISSE Antimoshka', async () => {
    const kb = await loadKnowledgeBase(knowledgeRoot);
    const rule = kb.getRuleById('SM-PROD-008');
    expect(rule?.status).toBe('approved');
    const active = getActiveRuleVersion(rule!);
    expect(active.instruction).toContain('Антимошка');
    expect(active.instruction).toContain('Не считать эту конфигурацию недоступной');
    expect(active.source).toEqual({
      type: 'owner',
      reference: 'owner-clarification-2026-08-12-plisse-antimoshka',
    });
  });

  it('KB-9 duplicate rule ID fails with a clear error', () => {
    const base = parseKnowledgeRule({
      id: 'DUP-1',
      title: 'Dup',
      category: 'sales',
      status: 'approved',
      activeVersion: 1,
      tags: [],
      versions: [
        {
          version: 1,
          condition: 'c',
          instruction: 'i',
          source: { type: 'owner' },
          createdAt: '2026-08-12T00:00:00.000Z',
        },
      ],
    });

    expect(() => buildKnowledgeRules([base, { ...base }])).toThrow(KnowledgeValidationError);
    expect(() => buildKnowledgeRules([base, { ...base }])).toThrow(/Duplicate knowledge rule id/);
  });
});

describe('Regression loader', () => {
  it('loads unique critical cases REG-001..005 with expected/forbidden behaviors', async () => {
    const cases = await loadRegressionCases(knowledgeRoot);
    const ids = cases.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['REG-001', 'REG-002', 'REG-003', 'REG-004', 'REG-005']));

    for (const item of cases) {
      expect(item.title.trim()).not.toBe('');
      expect(item.expectedBehaviors.length).toBeGreaterThan(0);
      expect(item.forbiddenBehaviors.length).toBeGreaterThan(0);
      expect(item.messages.length).toBeGreaterThan(0);
    }
  });
});
