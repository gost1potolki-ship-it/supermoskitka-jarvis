import {
  CUSTOMER_FACT_FIELDS,
  FULFILLMENT_FACT_FIELDS,
  ORDER_ITEM_FACT_FIELDS,
  type Channel,
  type CustomerFactField,
  type CustomerFactValue,
  type FactSource,
  type FulfillmentFactField,
  type FulfillmentFactValue,
  type OrderItemFactField,
  type OrderItemFactValue,
  type OrderMemory,
} from '../../domain/index.js';
import {
  addOrderItem,
  applyCustomerFact,
  applyFulfillmentFact,
  applyOrderItemFact,
} from '../memory/index.js';

import {
  canonicalizeColorFinish,
  canonicalizeMeshType,
  canonicalizeProductType,
  canonicalizeProfileColor,
  canonicalizeRal,
  normalizePhone,
} from './canonicalize.js';
import { evidenceMatchesMessage } from './evidence.js';
import type {
  ExtractedFieldProposal,
  ExtractionIssue,
  FactExtractionRequest,
  FactExtractionResult,
} from './extraction-types.js';

const ITEM_FIELDS = new Set<string>(ORDER_ITEM_FACT_FIELDS);
const CUSTOMER_FIELDS = new Set<string>(CUSTOMER_FACT_FIELDS);
const FULFILLMENT_FIELDS = new Set<string>(FULFILLMENT_FACT_FIELDS);

const FORBIDDEN_PRICE_FIELDS = new Set([
  'preliminaryTotal',
  'finalTotal',
  'discount',
  'unitPrice',
  'installationPrice',
  'deliveryPrice',
  'price',
  'total',
]);

export interface MemoryApplyDiagnostics {
  appliedFields: string[];
  issues: ExtractionIssue[];
  skipped: ExtractionIssue[];
}

export interface MemoryApplyResult {
  memory: OrderMemory;
  diagnostics: MemoryApplyDiagnostics;
}

function isChannel(value: string): value is Channel {
  return (
    value === 'telegram' ||
    value === 'website' ||
    value === 'whatsapp' ||
    value === 'avito' ||
    value === 'max' ||
    value === 'email' ||
    value === 'unknown'
  );
}

function sourceFromRequest(request: FactExtractionRequest): FactSource {
  return {
    sourceMessageId: request.currentMessage.id,
    sourceChannel: isChannel(request.currentMessage.channel)
      ? request.currentMessage.channel
      : 'unknown',
    sourceTimestamp: request.currentMessage.timestamp,
  };
}

function nextItemId(memory: OrderMemory): string {
  let max = 0;
  for (const item of memory.items) {
    const match = /^item-(\d+)$/.exec(item.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `item-${max + 1}`;
}

function rejectNameFromProxyMessage(messageText: string): boolean {
  const normalized = messageText.toLowerCase().replace(/ё/g, 'е');
  if (/передайте\s+\S+/.test(normalized) || /директор\s+\S+/.test(normalized)) {
    if (!/меня зовут|мое имя|я\s+[а-яa-z]/i.test(normalized)) {
      return true;
    }
  }
  return false;
}

function canonicalizeItemValue(
  field: OrderItemFactField,
  value: unknown,
): { ok: true; value: OrderItemFactValue[OrderItemFactField] } | { ok: false; reason: string } {
  if (field === 'productType') {
    const canonical = canonicalizeProductType(value);
    return canonical
      ? { ok: true, value: canonical }
      : { ok: false, reason: 'unknown productType' };
  }
  if (field === 'meshType') {
    const canonical = canonicalizeMeshType(value);
    return canonical ? { ok: true, value: canonical } : { ok: false, reason: 'unknown meshType' };
  }
  if (field === 'profileColor') {
    const canonical = canonicalizeProfileColor(value);
    return canonical
      ? { ok: true, value: canonical }
      : { ok: false, reason: 'unknown profileColor' };
  }
  if (field === 'colorFinish') {
    const canonical = canonicalizeColorFinish(value);
    return canonical
      ? { ok: true, value: canonical }
      : { ok: false, reason: 'unknown colorFinish' };
  }
  if (field === 'ral') {
    const canonical = canonicalizeRal(value);
    return canonical ? { ok: true, value: canonical } : { ok: false, reason: 'invalid ral' };
  }
  if (field === 'quantity' || field === 'widthMm' || field === 'heightMm') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, reason: `invalid ${field}` };
    }
    return { ok: true, value };
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, reason: `invalid ${field}` };
  }
  return { ok: true, value: value.trim() };
}

function canonicalizeCustomerValue(
  field: CustomerFactField,
  value: unknown,
): { ok: true; value: CustomerFactValue[CustomerFactField] } | { ok: false; reason: string } {
  if (field === 'customerType') {
    if (
      value === 'retail' ||
      value === 'dealer' ||
      value === 'corporate' ||
      value === 'unknown'
    ) {
      return { ok: true, value };
    }
    return { ok: false, reason: 'unknown customerType' };
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, reason: `invalid ${field}` };
  }
  if (field === 'phone') {
    return { ok: true, value: normalizePhone(value) };
  }
  return { ok: true, value: value.trim() };
}

function canonicalizeFulfillmentValue(
  field: FulfillmentFactField,
  value: unknown,
): { ok: true; value: FulfillmentFactValue[FulfillmentFactField] } | { ok: false; reason: string } {
  if (
    field === 'installationRequested' ||
    field === 'pickupRequested' ||
    field === 'deliveryRequested'
  ) {
    if (typeof value !== 'boolean') {
      return { ok: false, reason: `invalid ${field}` };
    }
    return { ok: true, value };
  }
  if (field === 'deliveryType') {
    if (value === 'city' || value === 'out' || value === 'pickup') {
      return { ok: true, value };
    }
    return { ok: false, reason: 'unknown deliveryType' };
  }
  if (field === 'deliveryKm') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, reason: 'invalid deliveryKm' };
    }
    return { ok: true, value };
  }
  return { ok: false, reason: `unsupported ${field}` };
}

function considerField(
  proposal: ExtractedFieldProposal,
  messageText: string,
  allowed: ReadonlySet<string>,
  path: string,
  diagnostics: MemoryApplyDiagnostics,
): boolean {
  if (FORBIDDEN_PRICE_FIELDS.has(proposal.field)) {
    diagnostics.issues.push({
      code: 'PRICE_FIELD_FORBIDDEN',
      message: `Price field rejected: ${proposal.field}`,
      path,
    });
    return false;
  }
  if (!allowed.has(proposal.field)) {
    diagnostics.issues.push({
      code: 'UNKNOWN_FIELD',
      message: `Unknown field: ${proposal.field}`,
      path,
    });
    return false;
  }
  if (proposal.explicitness !== 'EXPLICIT') {
    diagnostics.skipped.push({
      code: proposal.explicitness,
      message: `${proposal.field} not auto-applied (${proposal.explicitness})`,
      path,
    });
    return false;
  }
  if (!evidenceMatchesMessage(messageText, proposal.evidenceText)) {
    diagnostics.issues.push({
      code: 'EVIDENCE_MISMATCH',
      message: `Evidence not found in current message for ${proposal.field}`,
      path,
    });
    return false;
  }
  return true;
}

/**
 * Validate extraction proposals and apply EXPLICIT facts via existing memory APIs.
 * Fail closed: invalid proposals are skipped; never invent memory.
 */
export function applyValidatedExtraction(
  memory: OrderMemory,
  extraction: FactExtractionResult,
  request: FactExtractionRequest,
): MemoryApplyResult {
  const diagnostics: MemoryApplyDiagnostics = {
    appliedFields: [],
    issues: [...extraction.issues],
    skipped: [],
  };
  let next = memory;
  const source = sourceFromRequest(request);
  const messageText = request.currentMessage.text;

  for (let index = 0; index < extraction.itemProposals.length; index += 1) {
    const proposal = extraction.itemProposals[index]!;
    const path = `itemProposals[${index}]`;
    let targetId: string | null = null;

    if (proposal.operation === 'CREATE') {
      targetId = nextItemId(next);
      next = addOrderItem(next, targetId, source.sourceTimestamp);
    } else {
      if (proposal.targetItemId) {
        if (!next.items.some((item) => item.id === proposal.targetItemId)) {
          diagnostics.issues.push({
            code: 'UNKNOWN_ITEM_ID',
            message: `Invented targetItemId rejected: ${proposal.targetItemId}`,
            path,
          });
          continue;
        }
        targetId = proposal.targetItemId;
      } else if (proposal.targetOrdinal !== undefined) {
        const item = next.items[proposal.targetOrdinal - 1];
        if (!item) {
          diagnostics.issues.push({
            code: 'ORDINAL_OUT_OF_RANGE',
            message: `Ordinal out of range: ${proposal.targetOrdinal}`,
            path,
          });
          continue;
        }
        targetId = item.id;
      } else if (next.items.length === 1) {
        targetId = next.items[0]!.id;
      } else {
        diagnostics.issues.push({
          code: 'UNRESOLVED_TARGET',
          message: 'UPDATE without resolvable target',
          path,
        });
        continue;
      }
    }

    for (let factIndex = 0; factIndex < proposal.facts.length; factIndex += 1) {
      const fact = proposal.facts[factIndex]!;
      const factPath = `${path}.facts[${factIndex}]`;
      if (!considerField(fact, messageText, ITEM_FIELDS, factPath, diagnostics)) {
        continue;
      }
      const field = fact.field as OrderItemFactField;
      const canonical = canonicalizeItemValue(field, fact.value);
      if (!canonical.ok) {
        diagnostics.issues.push({
          code: 'INVALID_VALUE',
          message: canonical.reason,
          path: factPath,
        });
        continue;
      }
      const applied = applyOrderItemFact(next, {
        orderItemId: targetId,
        field,
        value: canonical.value as never,
        source,
      });
      next = applied.memory;
      diagnostics.appliedFields.push(`item:${targetId}.${field}`);

      // When color becomes GRAY_7016 and evidence mentions 7016, also store ral if not proposed.
      if (
        field === 'profileColor' &&
        canonical.value === 'GRAY_7016' &&
        /7016/.test(fact.evidenceText) &&
        !proposal.facts.some((entry) => entry.field === 'ral' && entry.explicitness === 'EXPLICIT')
      ) {
        const ralApplied = applyOrderItemFact(next, {
          orderItemId: targetId,
          field: 'ral',
          value: '7016',
          source,
        });
        next = ralApplied.memory;
        diagnostics.appliedFields.push(`item:${targetId}.ral`);
      }
    }
  }

  for (let index = 0; index < extraction.customerFacts.length; index += 1) {
    const fact = extraction.customerFacts[index]!;
    const path = `customerFacts[${index}]`;
    if (!considerField(fact, messageText, CUSTOMER_FIELDS, path, diagnostics)) {
      continue;
    }
    if (fact.field === 'name' && rejectNameFromProxyMessage(messageText)) {
      diagnostics.issues.push({
        code: 'NAME_NOT_CUSTOMER',
        message: 'Name looks like a third-party reference',
        path,
      });
      continue;
    }
    const field = fact.field as CustomerFactField;
    const canonical = canonicalizeCustomerValue(field, fact.value);
    if (!canonical.ok) {
      diagnostics.issues.push({
        code: 'INVALID_VALUE',
        message: canonical.reason,
        path,
      });
      continue;
    }
    const applied = applyCustomerFact(next, {
      field,
      value: canonical.value as never,
      source,
    });
    next = applied.memory;
    diagnostics.appliedFields.push(`customer.${field}`);
  }

  for (let index = 0; index < extraction.fulfillmentFacts.length; index += 1) {
    const fact = extraction.fulfillmentFacts[index]!;
    const path = `fulfillmentFacts[${index}]`;
    if (!considerField(fact, messageText, FULFILLMENT_FIELDS, path, diagnostics)) {
      continue;
    }
    const field = fact.field as FulfillmentFactField;
    const canonical = canonicalizeFulfillmentValue(field, fact.value);
    if (!canonical.ok) {
      diagnostics.issues.push({
        code: 'INVALID_VALUE',
        message: canonical.reason,
        path,
      });
      continue;
    }
    const applied = applyFulfillmentFact(next, {
      field,
      value: canonical.value as never,
      source,
    });
    next = applied.memory;
    diagnostics.appliedFields.push(`fulfillment.${field}`);
  }

  return { memory: next, diagnostics };
}
