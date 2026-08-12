import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

import {
  buildKnowledgeRules,
  KnowledgeValidationError,
  parseKnowledgeRule,
} from './knowledge-validation.js';
import { getActiveRuleVersion, type KnowledgeRule } from './types.js';

export function defaultKnowledgeRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../knowledge');
}

export class KnowledgeBase {
  private readonly rulesById: Map<string, KnowledgeRule>;

  constructor(rules: readonly KnowledgeRule[]) {
    const normalized = buildKnowledgeRules([...rules]);
    this.rulesById = new Map(normalized.map((rule) => [rule.id, rule]));
  }

  getAllRules(): KnowledgeRule[] {
    return [...this.rulesById.values()].map(cloneRule);
  }

  getApprovedRules(): KnowledgeRule[] {
    return this.getAllRules().filter((rule) => rule.status === 'approved');
  }

  getRuleById(id: string): KnowledgeRule | undefined {
    const rule = this.rulesById.get(id);
    return rule ? cloneRule(rule) : undefined;
  }

  getActiveVersionById(id: string) {
    const rule = this.getRuleById(id);
    return rule ? getActiveRuleVersion(rule) : undefined;
  }
}

function cloneRule(rule: KnowledgeRule): KnowledgeRule {
  return {
    ...rule,
    versions: rule.versions.map((version) => ({
      ...version,
      source: { ...version.source },
    })),
    tags: [...rule.tags],
  };
}

export async function loadKnowledgeBase(
  knowledgeRoot: string = defaultKnowledgeRoot(),
): Promise<KnowledgeBase> {
  const rulesDir = path.join(knowledgeRoot, 'rules');
  const entries = await readdir(rulesDir);
  const yamlFiles = entries.filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'));

  if (yamlFiles.length === 0) {
    throw new KnowledgeValidationError(`No knowledge rule YAML files found in ${rulesDir}`);
  }

  const rules: KnowledgeRule[] = [];

  for (const fileName of yamlFiles.sort()) {
    const filePath = path.join(rulesDir, fileName);
    const rawText = await readFile(filePath, 'utf8');
    const parsed = parseYaml(rawText) as unknown;

    if (!parsed || typeof parsed !== 'object' || !('rules' in parsed)) {
      throw new KnowledgeValidationError(`${fileName} must contain a top-level rules array`);
    }

    const fileRules = (parsed as { rules: unknown }).rules;
    if (!Array.isArray(fileRules)) {
      throw new KnowledgeValidationError(`${fileName}.rules must be an array`);
    }

    for (const [index, item] of fileRules.entries()) {
      rules.push(parseKnowledgeRule(item, `${fileName}.rules[${index}]`));
    }
  }

  return new KnowledgeBase(rules);
}

export { getActiveRuleVersion };
