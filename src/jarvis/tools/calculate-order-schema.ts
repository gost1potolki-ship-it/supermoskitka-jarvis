import type { LlmToolDefinition } from '../../llm/tool-calling-types.js';

/**
 * AI-facing calculate_order schema — TrustedCalculationToolInput only.
 * No discount, payment, installation overrides, or other monetary authority.
 */
export const CALCULATE_ORDER_PARAMETERS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'customerType', 'items'],
  properties: {
    mode: {
      type: 'string',
      enum: ['PRODUCT_ONLY', 'PRELIMINARY_ALL_IN'],
      description:
        'PRODUCT_ONLY = product price only (self-measure / pickup / self-install). PRELIMINARY_ALL_IN = preliminary turnkey order price with measurement, delivery, installation.',
    },
    customerType: {
      type: 'string',
      enum: ['retail', 'dealer', 'corporate'],
    },
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemId', 'productType'],
        properties: {
          itemId: { type: 'string', minLength: 1 },
          productType: {
            type: 'string',
            enum: ['FRAME', 'WING', 'DOOR', 'PLISSE_NET'],
          },
          widthMm: { type: 'number' },
          heightMm: { type: 'number' },
          quantity: { type: 'integer', minimum: 1 },
          meshType: {
            type: 'string',
            enum: ['STANDARD', 'ANTIMOSHKA', 'ANTICAT', 'ANTIDUST'],
          },
          color: {
            type: 'object',
            additionalProperties: false,
            required: ['kind'],
            properties: {
              kind: {
                type: 'string',
                enum: ['WHITE', 'BROWN_8017', 'GRAY_7016', 'CUSTOM_RAL'],
              },
              ral: { type: 'string' },
              finish: {
                type: 'string',
                enum: ['STANDARD', 'MATTE', 'GLOSS', 'MUAR'],
              },
            },
          },
          frameProfile: { type: 'string', enum: ['25', '32'] },
          fastening: {
            type: 'string',
            enum: ['Z_METAL', 'PLUNGER', 'WING_FLAGS'],
          },
          cornerType: { type: 'string', enum: ['PLASTIC', 'ALUMINUM'] },
          handleType: { type: 'string', enum: ['PLASTIC', 'METAL'] },
          doorProfile: { type: 'string', enum: ['32', '42'] },
          hingesCount: { type: 'integer', enum: [2, 3] },
          openingType: { type: 'string', enum: ['SIDE', 'COUNTER', 'UP'] },
          thresholdType: {
            type: 'string',
            enum: ['STANDARD', 'LOW', 'REINFORCED'],
          },
          handlesCount: { type: 'integer', minimum: 1 },
        },
      },
    },
    delivery: {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['city', 'out', 'pickup'] },
        distanceKm: { type: 'number' },
      },
    },
  },
} as const;

export const CALCULATE_ORDER_TOOL_NAME = 'calculate_order';

export function createCalculateOrderToolDefinition(): LlmToolDefinition {
  return {
    name: CALCULATE_ORDER_TOOL_NAME,
    description:
      'Calculate SuperMoskitka order price using the deterministic Calculation Engine. Always set mode: PRELIMINARY_ALL_IN for normal on-site orders; PRODUCT_ONLY only for explicit product-only / self-service. Do not invent prices, discounts, or overrides. After a calculated result, tell the customer only the total from the tool result.',
    parameters: CALCULATE_ORDER_PARAMETERS_SCHEMA as unknown as Record<string, unknown>,
  };
}
