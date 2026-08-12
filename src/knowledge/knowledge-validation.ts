import {
  getActiveRuleVersion,
  type KnowledgeRule,
  type KnowledgeRuleCategory,
  type KnowledgeRuleStatus,
  type KnowledgeRuleVersion,
  type KnowledgeSource,
  type KnowledgeSourceType,
} from './types.js';

const CATEGORIES = new Set<KnowledgeRuleCategory>([
  'sales',
  'products',
  'measurement',
  'installation',
  'delivery-payment',
  'warranty',
  'safety',
  'operations',
]);

const STATUSES = new Set<KnowledgeRuleStatus>(['draft', 'approved', 'rejected']);

const SOURCE_TYPES = new Set<KnowledgeSourceType>([
  'owner',
  'business-audit',
  'real-dialogue',
  'document',
  'learning-correction',
]);

export class KnowledgeValidationError extends Error {
  readonly code = 'KNOWLEDGE_VALIDATION_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeValidationError';
  }
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new KnowledgeValidationError(`${path} must be a non-empty string`);
  }
  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new KnowledgeValidationError(`${path} must be an integer`);
  }
  return value;
}

function parseSource(raw: unknown, path: string): KnowledgeSource {
  if (!raw || typeof raw !== 'object') {
    throw new KnowledgeValidationError(`${path} must be an object`);
  }
  const source = raw as Record<string, unknown>;
  const type = requireString(source.type, `${path}.type`) as KnowledgeSourceType;
  if (!SOURCE_TYPES.has(type)) {
    throw new KnowledgeValidationError(`${path}.type is invalid: ${type}`);
  }

  const result: KnowledgeSource = { type };
  if (source.reference !== undefined) {
    result.reference = requireString(source.reference, `${path}.reference`);
  }
  if (source.note !== undefined) {
    result.note = requireString(source.note, `${path}.note`);
  }
  return result;
}

function parseVersion(raw: unknown, path: string): KnowledgeRuleVersion {
  if (!raw || typeof raw !== 'object') {
    throw new KnowledgeValidationError(`${path} must be an object`);
  }
  const version = raw as Record<string, unknown>;
  const parsed: KnowledgeRuleVersion = {
    version: requireNumber(version.version, `${path}.version`),
    condition: requireString(version.condition, `${path}.condition`),
    instruction: requireString(version.instruction, `${path}.instruction`),
    source: parseSource(version.source, `${path}.source`),
    createdAt: requireString(version.createdAt, `${path}.createdAt`),
  };

  if (version.reason !== undefined) {
    parsed.reason = requireString(version.reason, `${path}.reason`);
  }
  if (version.responseTemplate !== undefined) {
    parsed.responseTemplate = requireString(
      version.responseTemplate,
      `${path}.responseTemplate`,
    );
  }
  if (version.approvedAt !== undefined) {
    parsed.approvedAt = requireString(version.approvedAt, `${path}.approvedAt`);
  }

  return parsed;
}

export function parseKnowledgeRule(raw: unknown, path = 'rule'): KnowledgeRule {
  if (!raw || typeof raw !== 'object') {
    throw new KnowledgeValidationError(`${path} must be an object`);
  }

  const rule = raw as Record<string, unknown>;
  const category = requireString(rule.category, `${path}.category`) as KnowledgeRuleCategory;
  if (!CATEGORIES.has(category)) {
    throw new KnowledgeValidationError(`${path}.category is invalid: ${category}`);
  }

  const status = requireString(rule.status, `${path}.status`) as KnowledgeRuleStatus;
  if (!STATUSES.has(status)) {
    throw new KnowledgeValidationError(`${path}.status is invalid: ${status}`);
  }

  if (!Array.isArray(rule.versions) || rule.versions.length === 0) {
    throw new KnowledgeValidationError(`${path}.versions must be a non-empty array`);
  }

  const versions = rule.versions.map((item, index) =>
    parseVersion(item, `${path}.versions[${index}]`),
  );

  const tags = Array.isArray(rule.tags)
    ? rule.tags.map((tag, index) => requireString(tag, `${path}.tags[${index}]`))
    : [];

  const parsed: KnowledgeRule = {
    id: requireString(rule.id, `${path}.id`),
    title: requireString(rule.title, `${path}.title`),
    category,
    status,
    activeVersion: requireNumber(rule.activeVersion, `${path}.activeVersion`),
    versions,
    tags,
  };

  // Ensure active version exists
  getActiveRuleVersion(parsed);
  return parsed;
}

export function buildKnowledgeRules(rules: KnowledgeRule[]): KnowledgeRule[] {
  const seen = new Set<string>();
  for (const rule of rules) {
    getActiveRuleVersion(rule);
    if (seen.has(rule.id)) {
      throw new KnowledgeValidationError(`Duplicate knowledge rule id: ${rule.id}`);
    }
    seen.add(rule.id);
  }
  return rules.map((rule) => ({
    ...rule,
    versions: rule.versions.map((version) => ({ ...version, source: { ...version.source } })),
    tags: [...rule.tags],
  }));
}
