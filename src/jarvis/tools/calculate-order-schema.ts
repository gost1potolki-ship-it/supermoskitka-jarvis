import type { LlmToolDefinition } from '../../llm/tool-calling-types.js';

/** Canonical JSON Schema for calculate_order — mirrors public CalculationRequest. */
export const CALCULATE_ORDER_PARAMETERS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['customerType', 'items'],
  properties: {
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
    installation: {
      type: 'object',
      additionalProperties: false,
      required: ['enabled'],
      properties: {
        enabled: { type: 'boolean' },
        overrideAmount: { type: ['number', 'null'] },
      },
    },
    measurement: {
      type: 'object',
      additionalProperties: false,
      required: ['includeFee'],
      properties: {
        includeFee: { type: 'boolean' },
        paidCash: { type: 'boolean' },
      },
    },
    discount: {
      type: 'object',
      additionalProperties: false,
      required: ['percent'],
      properties: {
        percent: { type: 'integer', enum: [0, 5, 10] },
      },
    },
    payment: {
      type: 'object',
      additionalProperties: false,
      required: ['method'],
      properties: {
        method: { type: 'string', enum: ['cash', 'qr'] },
      },
    },
  },
} as const;

export const CALCULATE_ORDER_TOOL_NAME = 'calculate_order';

export function createCalculateOrderToolDefinition(): LlmToolDefinition {
  return {
    name: CALCULATE_ORDER_TOOL_NAME,
    description:
      'Calculate SuperMoskitka order price using the deterministic Calculation Engine. Use for any concrete customer order pricing. Do not invent prices yourself. After a calculated result, tell the customer the total from the tool result.',
    parameters: CALCULATE_ORDER_PARAMETERS_SCHEMA as unknown as Record<string, unknown>,
  };
}
