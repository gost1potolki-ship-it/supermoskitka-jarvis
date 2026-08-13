import type {
  ExtractedFieldProposal,
  ExtractedItemProposal,
  ExtractionIssue,
  FactExtractionResult,
  FactExplicitness,
  ItemProposalOperation,
} from './extraction-types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): ExtractionIssue | null {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      return { code: 'UNKNOWN_FIELD', message: `Unknown field: ${path}.${key}`, path };
    }
  }
  return null;
}

function parseFieldProposal(
  value: unknown,
  path: string,
): { ok: true; proposal: ExtractedFieldProposal } | { ok: false; issue: ExtractionIssue } {
  if (!isRecord(value)) {
    return { ok: false, issue: { code: 'INVALID_SHAPE', message: `Invalid ${path}`, path } };
  }
  const keys = assertOnlyKeys(
    value,
    new Set(['field', 'value', 'explicitness', 'evidenceText', 'confidence']),
    path,
  );
  if (keys) {
    return { ok: false, issue: keys };
  }
  if (typeof value.field !== 'string' || value.field.trim() === '') {
    return { ok: false, issue: { code: 'INVALID_FIELD', message: `Invalid ${path}.field`, path } };
  }
  if (!('value' in value)) {
    return { ok: false, issue: { code: 'INVALID_VALUE', message: `Missing ${path}.value`, path } };
  }
  const explicitness = value.explicitness;
  if (
    explicitness !== 'EXPLICIT' &&
    explicitness !== 'UNCERTAIN' &&
    explicitness !== 'HYPOTHETICAL'
  ) {
    return {
      ok: false,
      issue: { code: 'INVALID_EXPLICITNESS', message: `Invalid ${path}.explicitness`, path },
    };
  }
  if (typeof value.evidenceText !== 'string' || value.evidenceText.trim() === '') {
    return {
      ok: false,
      issue: { code: 'INVALID_EVIDENCE', message: `Invalid ${path}.evidenceText`, path },
    };
  }
  if (
    value.confidence !== undefined &&
    (typeof value.confidence !== 'number' ||
      value.confidence < 0 ||
      value.confidence > 1 ||
      !Number.isFinite(value.confidence))
  ) {
    return {
      ok: false,
      issue: { code: 'INVALID_CONFIDENCE', message: `Invalid ${path}.confidence`, path },
    };
  }
  return {
    ok: true,
    proposal: {
      field: value.field,
      value: value.value,
      explicitness: explicitness as FactExplicitness,
      evidenceText: value.evidenceText,
      ...(value.confidence !== undefined ? { confidence: value.confidence } : {}),
    },
  };
}

function parseItemProposal(
  value: unknown,
  path: string,
): { ok: true; proposal: ExtractedItemProposal } | { ok: false; issue: ExtractionIssue } {
  if (!isRecord(value)) {
    return { ok: false, issue: { code: 'INVALID_SHAPE', message: `Invalid ${path}`, path } };
  }
  const keys = assertOnlyKeys(
    value,
    new Set(['operation', 'targetItemId', 'targetOrdinal', 'facts']),
    path,
  );
  if (keys) {
    return { ok: false, issue: keys };
  }
  const operation = value.operation;
  if (operation !== 'CREATE' && operation !== 'UPDATE') {
    return {
      ok: false,
      issue: { code: 'INVALID_OPERATION', message: `Invalid ${path}.operation`, path },
    };
  }
  if (value.targetItemId !== undefined && typeof value.targetItemId !== 'string') {
    return {
      ok: false,
      issue: { code: 'INVALID_TARGET', message: `Invalid ${path}.targetItemId`, path },
    };
  }
  if (
    value.targetOrdinal !== undefined &&
    (typeof value.targetOrdinal !== 'number' ||
      !Number.isInteger(value.targetOrdinal) ||
      value.targetOrdinal < 1)
  ) {
    return {
      ok: false,
      issue: { code: 'INVALID_ORDINAL', message: `Invalid ${path}.targetOrdinal`, path },
    };
  }
  if (!Array.isArray(value.facts)) {
    return { ok: false, issue: { code: 'INVALID_FACTS', message: `Invalid ${path}.facts`, path } };
  }
  const facts: ExtractedFieldProposal[] = [];
  for (let index = 0; index < value.facts.length; index += 1) {
    const parsed = parseFieldProposal(value.facts[index], `${path}.facts[${index}]`);
    if (!parsed.ok) {
      return parsed;
    }
    facts.push(parsed.proposal);
  }
  return {
    ok: true,
    proposal: {
      operation: operation as ItemProposalOperation,
      ...(typeof value.targetItemId === 'string' ? { targetItemId: value.targetItemId } : {}),
      ...(typeof value.targetOrdinal === 'number' ? { targetOrdinal: value.targetOrdinal } : {}),
      facts,
    },
  };
}

/**
 * Strict runtime parse of extract_order_facts arguments JSON.
 * Unknown keys → reject entire structured extraction.
 */
export function parseExtractOrderFactsArguments(
  argumentsJson: string,
): { ok: true; result: FactExtractionResult } | { ok: false; issues: ExtractionIssue[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argumentsJson);
  } catch {
    return {
      ok: false,
      issues: [{ code: 'INVALID_JSON', message: 'extract_order_facts arguments are not valid JSON' }],
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      issues: [{ code: 'INVALID_SHAPE', message: 'extract_order_facts root must be an object' }],
    };
  }

  const rootKeys = assertOnlyKeys(
    parsed,
    new Set(['itemProposals', 'customerFacts', 'fulfillmentFacts', 'commercialFacts']),
    'root',
  );
  if (rootKeys) {
    return { ok: false, issues: [rootKeys] };
  }

  if (
    !Array.isArray(parsed.itemProposals) ||
    !Array.isArray(parsed.customerFacts) ||
    !Array.isArray(parsed.fulfillmentFacts) ||
    !Array.isArray(parsed.commercialFacts)
  ) {
    return {
      ok: false,
      issues: [{ code: 'INVALID_SHAPE', message: 'Missing required proposal arrays' }],
    };
  }

  const itemProposals: ExtractedItemProposal[] = [];
  for (let index = 0; index < parsed.itemProposals.length; index += 1) {
    const item = parseItemProposal(parsed.itemProposals[index], `itemProposals[${index}]`);
    if (!item.ok) {
      return { ok: false, issues: [item.issue] };
    }
    itemProposals.push(item.proposal);
  }

  const customerFacts: ExtractedFieldProposal[] = [];
  for (let index = 0; index < parsed.customerFacts.length; index += 1) {
    const fact = parseFieldProposal(parsed.customerFacts[index], `customerFacts[${index}]`);
    if (!fact.ok) {
      return { ok: false, issues: [fact.issue] };
    }
    customerFacts.push(fact.proposal);
  }

  const fulfillmentFacts: ExtractedFieldProposal[] = [];
  for (let index = 0; index < parsed.fulfillmentFacts.length; index += 1) {
    const fact = parseFieldProposal(parsed.fulfillmentFacts[index], `fulfillmentFacts[${index}]`);
    if (!fact.ok) {
      return { ok: false, issues: [fact.issue] };
    }
    fulfillmentFacts.push(fact.proposal);
  }

  const commercialFacts: ExtractedFieldProposal[] = [];
  for (let index = 0; index < parsed.commercialFacts.length; index += 1) {
    const fact = parseFieldProposal(parsed.commercialFacts[index], `commercialFacts[${index}]`);
    if (!fact.ok) {
      return { ok: false, issues: [fact.issue] };
    }
    commercialFacts.push(fact.proposal);
  }

  return {
    ok: true,
    result: {
      itemProposals,
      customerFacts,
      fulfillmentFacts,
      commercialFacts,
      issues: [],
    },
  };
}
