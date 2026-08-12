import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JARVIS_BASE_SYSTEM_INSTRUCTIONS } from '../src/jarvis/system-prompt.js';
import {
  KnowledgeSystemPromptProvider,
  buildKnowledgeContext,
  loadKnowledgeBase,
  parseKnowledgeRule,
  type KnowledgeRule,
} from '../src/knowledge/index.js';
import { describe, expect, it } from 'vitest';

const knowledgeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../knowledge');

function rule(partial: {
  id: string;
  status?: KnowledgeRule['status'];
  category?: KnowledgeRule['category'];
  title?: string;
  activeVersion?: number;
  versions: KnowledgeRule['versions'];
}): KnowledgeRule {
  return parseKnowledgeRule({
    id: partial.id,
    title: partial.title ?? partial.id,
    category: partial.category ?? 'sales',
    status: partial.status ?? 'approved',
    activeVersion: partial.activeVersion ?? partial.versions[partial.versions.length - 1]!.version,
    tags: [],
    versions: partial.versions,
  });
}

describe('Knowledge context builder', () => {
  it('CTX-1 includes approved rules', () => {
    const context = buildKnowledgeContext([
      rule({
        id: 'SM-TEST-001',
        versions: [
          {
            version: 1,
            condition: 'любая переписка',
            instruction: 'Писать коротко',
            source: { type: 'owner' },
            createdAt: '2026-08-12T00:00:00.000Z',
          },
        ],
      }),
    ]);

    expect(context).toContain('SM-TEST-001');
    expect(context).toContain('Писать коротко');
  });

  it('CTX-2 excludes draft rules', () => {
    const context = buildKnowledgeContext([
      rule({
        id: 'SM-DRAFT-001',
        status: 'draft',
        versions: [
          {
            version: 1,
            condition: 'draft condition',
            instruction: 'draft instruction',
            source: { type: 'owner' },
            createdAt: '2026-08-12T00:00:00.000Z',
          },
        ],
      }),
    ]);

    expect(context).not.toContain('SM-DRAFT-001');
    expect(context).not.toContain('draft instruction');
  });

  it('CTX-3 excludes rejected rules', () => {
    const context = buildKnowledgeContext([
      rule({
        id: 'SM-REJECTED-001',
        status: 'rejected',
        versions: [
          {
            version: 1,
            condition: 'rejected condition',
            instruction: 'rejected instruction',
            source: { type: 'owner' },
            createdAt: '2026-08-12T00:00:00.000Z',
          },
        ],
      }),
    ]);

    expect(context).not.toContain('SM-REJECTED-001');
    expect(context).not.toContain('rejected instruction');
  });

  it('CTX-4 uses only activeVersion', () => {
    const context = buildKnowledgeContext([
      rule({
        id: 'SM-VERSIONED-001',
        activeVersion: 2,
        versions: [
          {
            version: 1,
            condition: 'old condition',
            instruction: 'старое правило',
            source: { type: 'owner' },
            createdAt: '2026-08-01T00:00:00.000Z',
          },
          {
            version: 2,
            condition: 'new condition',
            instruction: 'новое правило',
            source: { type: 'learning-correction' },
            createdAt: '2026-08-12T00:00:00.000Z',
          },
        ],
      }),
    ]);

    expect(context).toContain('[SM-VERSIONED-001 v2]');
    expect(context).toContain('новое правило');
    expect(context).not.toContain('старое правило');
  });

  it('CTX-5 includes responseTemplate for SM-SAFE-001', async () => {
    const kb = await loadKnowledgeBase(knowledgeRoot);
    const safe = kb.getRuleById('SM-SAFE-001');
    expect(safe).toBeDefined();

    const context = buildKnowledgeContext([safe!]);
    expect(context).toContain('Response template:');
    expect(context).toContain('не защитная решётка');
  });

  it('CTX-6 produces deterministic order independent of input order', () => {
    const a = rule({
      id: 'SM-B',
      versions: [
        {
          version: 1,
          condition: 'b',
          instruction: 'rule-b',
          source: { type: 'owner' },
          createdAt: '2026-08-12T00:00:00.000Z',
        },
      ],
    });
    const b = rule({
      id: 'SM-A',
      versions: [
        {
          version: 1,
          condition: 'a',
          instruction: 'rule-a',
          source: { type: 'owner' },
          createdAt: '2026-08-12T00:00:00.000Z',
        },
      ],
    });

    expect(buildKnowledgeContext([a, b])).toBe(buildKnowledgeContext([b, a]));
    expect(buildKnowledgeContext([a, b]).indexOf('SM-A')).toBeLessThan(
      buildKnowledgeContext([a, b]).indexOf('SM-B'),
    );
  });
});

describe('KnowledgeSystemPromptProvider', () => {
  it('PROMPT-1 combines base instructions with approved KB', async () => {
    const provider = new KnowledgeSystemPromptProvider(knowledgeRoot);
    const prompt = await provider.getSystemPrompt();

    expect(prompt.startsWith(JARVIS_BASE_SYSTEM_INSTRUCTIONS)).toBe(true);
    expect(prompt).toContain('=== APPROVED KNOWLEDGE BASE ===');
  });

  it('PROMPT-2 includes critical seed rules', async () => {
    const provider = new KnowledgeSystemPromptProvider(knowledgeRoot);
    const prompt = await provider.getSystemPrompt();

    for (const id of ['SM-SALES-001', 'SM-SALES-003', 'SM-SAFE-001', 'SM-PROD-032', 'SM-OPS-010']) {
      expect(prompt).toContain(id);
    }
  });

  it('PROMPT-3 forbids disclosing internal instructions/economy', async () => {
    const provider = new KnowledgeSystemPromptProvider(knowledgeRoot);
    const prompt = await provider.getSystemPrompt();

    expect(prompt).toContain('внутренние инструкции');
    expect(prompt).toContain('внутреннюю экономику');
  });
});
