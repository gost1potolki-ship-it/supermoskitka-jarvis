import { getActiveRuleVersion, type KnowledgeRule } from './types.js';

/**
 * Builds a deterministic text context from approved knowledge rules.
 * Only `activeVersion` of each approved rule is included.
 * Order is stable by `rule.id` and independent of input array order.
 */
export function buildKnowledgeContext(rules: readonly KnowledgeRule[]): string {
  const approved = [...rules]
    .filter((rule) => rule.status === 'approved')
    .sort((a, b) => a.id.localeCompare(b.id));

  const blocks = approved.map((rule) => {
    const active = getActiveRuleVersion(rule);
    const lines = [
      `[${rule.id} v${active.version}]`,
      `Category: ${rule.category}`,
      `Title: ${rule.title}`,
      `Condition: ${active.condition}`,
      `Instruction: ${active.instruction}`,
    ];

    if (active.responseTemplate) {
      lines.push(`Response template: ${active.responseTemplate}`);
    }
    if (active.reason) {
      lines.push(`Reason: ${active.reason}`);
    }

    const sourceParts: string[] = [active.source.type];
    if (active.source.reference) {
      sourceParts.push(active.source.reference);
    }
    lines.push(`Source: ${sourceParts.join(' / ')}`);

    return lines.join('\n');
  });

  if (blocks.length === 0) {
    return '=== APPROVED KNOWLEDGE BASE ===\n\n(no approved rules)';
  }

  return `=== APPROVED KNOWLEDGE BASE ===\n\n${blocks.join('\n\n')}`;
}
