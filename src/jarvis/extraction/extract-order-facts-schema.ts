import type { LlmToolDefinition } from '../../llm/tool-calling-types.js';

const ITEM_FACT_FIELDS = [
  'productType',
  'quantity',
  'widthMm',
  'heightMm',
  'measurementBasis',
  'meshType',
  'profileType',
  'profileColor',
  'ral',
  'colorFinish',
  'fastening',
  'openingType',
  'comment',
] as const;

const CUSTOMER_FACT_FIELDS = ['name', 'phone', 'address', 'customerType'] as const;

const FULFILLMENT_FACT_FIELDS = [
  'installationRequested',
  'pickupRequested',
  'deliveryRequested',
  'deliveryType',
  'deliveryKm',
] as const;

const COMMERCIAL_FACT_FIELDS = ['preliminaryPriceAccepted', 'measurementAgreed'] as const;

const ITEM_FIELD_PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['field', 'value', 'explicitness', 'evidenceText'],
  properties: {
    field: { type: 'string', enum: [...ITEM_FACT_FIELDS] },
    value: {},
    explicitness: {
      type: 'string',
      enum: ['EXPLICIT', 'UNCERTAIN', 'HYPOTHETICAL'],
    },
    evidenceText: { type: 'string', minLength: 1 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

const CUSTOMER_FIELD_PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['field', 'value', 'explicitness', 'evidenceText'],
  properties: {
    field: { type: 'string', enum: [...CUSTOMER_FACT_FIELDS] },
    value: {},
    explicitness: {
      type: 'string',
      enum: ['EXPLICIT', 'UNCERTAIN', 'HYPOTHETICAL'],
    },
    evidenceText: { type: 'string', minLength: 1 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

const FULFILLMENT_FIELD_PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['field', 'value', 'explicitness', 'evidenceText'],
  properties: {
    field: { type: 'string', enum: [...FULFILLMENT_FACT_FIELDS] },
    value: {},
    explicitness: {
      type: 'string',
      enum: ['EXPLICIT', 'UNCERTAIN', 'HYPOTHETICAL'],
    },
    evidenceText: { type: 'string', minLength: 1 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

const COMMERCIAL_FIELD_PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['field', 'value', 'explicitness', 'evidenceText'],
  properties: {
    field: { type: 'string', enum: [...COMMERCIAL_FACT_FIELDS] },
    value: { type: 'boolean' },
    explicitness: {
      type: 'string',
      enum: ['EXPLICIT', 'UNCERTAIN', 'HYPOTHETICAL'],
    },
    evidenceText: { type: 'string', minLength: 1 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

export const EXTRACT_ORDER_FACTS_TOOL_NAME = 'extract_order_facts';

export const EXTRACT_ORDER_FACTS_PARAMETERS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['itemProposals', 'customerFacts', 'fulfillmentFacts', 'commercialFacts'],
  properties: {
    itemProposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['operation', 'facts'],
        properties: {
          operation: { type: 'string', enum: ['CREATE', 'UPDATE'] },
          targetItemId: { type: 'string' },
          targetOrdinal: { type: 'integer', minimum: 1 },
          facts: {
            type: 'array',
            items: ITEM_FIELD_PROPOSAL_SCHEMA,
          },
        },
      },
    },
    customerFacts: {
      type: 'array',
      items: CUSTOMER_FIELD_PROPOSAL_SCHEMA,
    },
    fulfillmentFacts: {
      type: 'array',
      items: FULFILLMENT_FIELD_PROPOSAL_SCHEMA,
    },
    commercialFacts: {
      type: 'array',
      items: COMMERCIAL_FIELD_PROPOSAL_SCHEMA,
    },
  },
} as const;

export function createExtractOrderFactsToolDefinition(): LlmToolDefinition {
  return {
    name: EXTRACT_ORDER_FACTS_TOOL_NAME,
    description:
      'Extract ONLY explicit order facts from the current customer message. Every fact must include evidenceText copied from that message. Use UNCERTAIN/HYPOTHETICAL when not definite. Do not invent prices or discounts. Do not invent item IDs — use CREATE for new items or existing targetItemId/targetOrdinal from the provided memory list. Item color field is profileColor (WHITE/BROWN_8017/GRAY_7016/CUSTOM_RAL). measurementBasis: PRODUCT_SIZE when client gives finished product size; LIGHT_OPENING when size is by light opening / black rubber gasket. commercialFacts: preliminaryPriceAccepted / measurementAgreed only when explicitly stated — never from quoted amounts.',
    parameters: EXTRACT_ORDER_FACTS_PARAMETERS_SCHEMA as unknown as Record<string, unknown>,
  };
}
