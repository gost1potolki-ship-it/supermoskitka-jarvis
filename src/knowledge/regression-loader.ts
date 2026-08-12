import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import type { MessageSender } from '../domain/message.js';

import { defaultKnowledgeRoot } from './knowledge-loader.js';
import { KnowledgeValidationError } from './knowledge-validation.js';
import type { RegressionCase, RegressionCaseMessage } from './regression-types.js';
import type { KnowledgeSource, KnowledgeSourceType } from './types.js';

const SENDERS = new Set<MessageSender>(['CUSTOMER', 'AI', 'HUMAN', 'SYSTEM']);
const SOURCE_TYPES = new Set<KnowledgeSourceType>([
  'owner',
  'business-audit',
  'real-dialogue',
  'document',
  'learning-correction',
]);

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new KnowledgeValidationError(`${label} must be a non-empty string`);
  }
  return value;
}

function parseSource(raw: unknown, label: string): KnowledgeSource {
  if (!raw || typeof raw !== 'object') {
    throw new KnowledgeValidationError(`${label} must be an object`);
  }
  const source = raw as Record<string, unknown>;
  const type = requireString(source.type, `${label}.type`) as KnowledgeSourceType;
  if (!SOURCE_TYPES.has(type)) {
    throw new KnowledgeValidationError(`${label}.type is invalid: ${type}`);
  }
  const result: KnowledgeSource = { type };
  if (source.reference !== undefined) {
    result.reference = requireString(source.reference, `${label}.reference`);
  }
  if (source.note !== undefined) {
    result.note = requireString(source.note, `${label}.note`);
  }
  return result;
}

function parseMessage(raw: unknown, label: string): RegressionCaseMessage {
  if (!raw || typeof raw !== 'object') {
    throw new KnowledgeValidationError(`${label} must be an object`);
  }
  const message = raw as Record<string, unknown>;
  const sender = requireString(message.sender, `${label}.sender`) as MessageSender;
  if (!SENDERS.has(sender)) {
    throw new KnowledgeValidationError(`${label}.sender is invalid: ${sender}`);
  }
  return {
    sender,
    text: requireString(message.text, `${label}.text`),
  };
}

export function parseRegressionCase(raw: unknown, label = 'case'): RegressionCase {
  if (!raw || typeof raw !== 'object') {
    throw new KnowledgeValidationError(`${label} must be an object`);
  }
  const item = raw as Record<string, unknown>;

  if (!Array.isArray(item.messages)) {
    throw new KnowledgeValidationError(`${label}.messages must be an array`);
  }
  if (!Array.isArray(item.expectedBehaviors) || item.expectedBehaviors.length === 0) {
    throw new KnowledgeValidationError(`${label}.expectedBehaviors must be a non-empty array`);
  }
  if (!Array.isArray(item.forbiddenBehaviors) || item.forbiddenBehaviors.length === 0) {
    throw new KnowledgeValidationError(`${label}.forbiddenBehaviors must be a non-empty array`);
  }

  return {
    id: requireString(item.id, `${label}.id`),
    title: requireString(item.title, `${label}.title`),
    source: parseSource(item.source, `${label}.source`),
    messages: item.messages.map((message, index) =>
      parseMessage(message, `${label}.messages[${index}]`),
    ),
    expectedBehaviors: item.expectedBehaviors.map((behavior, index) =>
      requireString(behavior, `${label}.expectedBehaviors[${index}]`),
    ),
    forbiddenBehaviors: item.forbiddenBehaviors.map((behavior, index) =>
      requireString(behavior, `${label}.forbiddenBehaviors[${index}]`),
    ),
    tags: Array.isArray(item.tags)
      ? item.tags.map((tag, index) => requireString(tag, `${label}.tags[${index}]`))
      : [],
  };
}

export function buildRegressionCases(cases: RegressionCase[]): RegressionCase[] {
  const seen = new Set<string>();
  for (const item of cases) {
    if (seen.has(item.id)) {
      throw new KnowledgeValidationError(`Duplicate regression case id: ${item.id}`);
    }
    seen.add(item.id);
  }
  return cases.map((item) => ({
    ...item,
    source: { ...item.source },
    messages: item.messages.map((message) => ({ ...message })),
    expectedBehaviors: [...item.expectedBehaviors],
    forbiddenBehaviors: [...item.forbiddenBehaviors],
    tags: [...item.tags],
  }));
}

export async function loadRegressionCases(
  knowledgeRoot: string = defaultKnowledgeRoot(),
): Promise<RegressionCase[]> {
  const filePath = path.join(knowledgeRoot, 'regression', 'critical-cases.yaml');
  const rawText = await readFile(filePath, 'utf8');
  const parsed = parseYaml(rawText) as unknown;

  if (!parsed || typeof parsed !== 'object' || !('cases' in parsed)) {
    throw new KnowledgeValidationError('critical-cases.yaml must contain a top-level cases array');
  }

  const cases = (parsed as { cases: unknown }).cases;
  if (!Array.isArray(cases)) {
    throw new KnowledgeValidationError('critical-cases.yaml cases must be an array');
  }

  return buildRegressionCases(
    cases.map((item, index) => parseRegressionCase(item, `cases[${index}]`)),
  );
}
