import { getFactValue } from '../../domain/index.js';
import {
  isToolCallingLlmProvider,
  type LlmProvider,
} from '../../llm/llm-provider.js';
import type { LlmToolConversationMessage } from '../../llm/tool-calling-types.js';

import {
  createExtractOrderFactsToolDefinition,
  EXTRACT_ORDER_FACTS_TOOL_NAME,
} from './extract-order-facts-schema.js';
import {
  FactExtractionConfigError,
  type FactExtractionRequest,
  type FactExtractionResult,
  type FactExtractor,
} from './extraction-types.js';
import { parseExtractOrderFactsArguments } from './parse-extraction-result.js';

const EXTRACTION_SYSTEM = `You extract structured SuperMoskitka order facts from the CURRENT customer message only.

Rules:
- Call extract_order_facts exactly once.
- Every fact must include evidenceText copied from the current customer message.
- Use EXPLICIT only for definite chosen facts.
- Use UNCERTAIN for guesses ("наверное").
- Use HYPOTHETICAL for conditional branches ("если ...").
- Do not invent prices, discounts, or totals.
- Never store quoted monetary amounts as order facts.
- commercialFacts: preliminaryPriceAccepted when client explicitly agrees to the quoted preliminary price; measurementAgreed when client explicitly agrees to schedule measurement. False when explicitly declined.
- For new products use operation CREATE (do not invent item IDs).
- For updates use existing targetItemId or 1-based targetOrdinal from the memory list.
- Canonical enums: FRAME/WING/DOOR/PLISSE_NET; STANDARD/ANTIMOSHKA/ANTICAT/ANTIDUST; WHITE/BROWN_8017/GRAY_7016/CUSTOM_RAL.
- Always extract explicit color into field profileColor: белый→WHITE, коричневый/8017→BROWN_8017, серый/антрацит/7016→GRAY_7016. Also store ral when a RAL code is explicit. Never use field name "color".
- colorFinish: муар / глянец / матовый when explicit. Never use field name "finish".
- Mesh goes to meshType, never "mesh".
- measurementBasis: PRODUCT_SIZE for finished product/grid size; LIGHT_OPENING for light opening / black gasket size.
- Fulfillment only when explicit (installationRequested, pickupRequested, deliveryRequested, deliveryType, deliveryKm).
- Customer name only for self-identification, never from "передайте X" / "директор X".`;

function buildExtractionMessages(request: FactExtractionRequest): LlmToolConversationMessage[] {
  const itemLines =
    request.memorySnapshot.items.length === 0
      ? ['(no items yet)']
      : request.memorySnapshot.items.map((item, index) => {
          const bits = [
            `ordinal=${index + 1}`,
            `id=${item.id}`,
            getFactValue(item.productType),
            getFactValue(item.widthMm) !== undefined && getFactValue(item.heightMm) !== undefined
              ? `${getFactValue(item.widthMm)}x${getFactValue(item.heightMm)}`
              : undefined,
            getFactValue(item.meshType),
            getFactValue(item.profileColor),
            getFactValue(item.ral) !== undefined ? `RAL ${getFactValue(item.ral)}` : undefined,
            getFactValue(item.colorFinish),
          ].filter(Boolean);
          return `- ${bits.join(', ')}`;
        });

  const contextLines = request.recentContext
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()}: ${message.text}`);

  return [
    { role: 'system', content: EXTRACTION_SYSTEM },
    {
      role: 'user',
      content: [
        'Existing memory items:',
        ...itemLines,
        '',
        'Recent context (for references only, NOT a new fact source):',
        ...(contextLines.length > 0 ? contextLines : ['(none)']),
        '',
        'CURRENT CUSTOMER MESSAGE (only source for new facts):',
        request.currentMessage.text,
      ].join('\n'),
    },
  ];
}

export class LlmFactExtractor implements FactExtractor {
  constructor(private readonly llm: LlmProvider) {}

  async extract(request: FactExtractionRequest): Promise<FactExtractionResult> {
    if (!isToolCallingLlmProvider(this.llm)) {
      throw new FactExtractionConfigError(
        'FACT_EXTRACTION_CONFIG_ERROR: LLM provider does not support tool calling',
      );
    }

    const response = await this.llm.generateWithTools({
      conversationId: request.conversationId,
      messages: buildExtractionMessages(request),
      tools: [createExtractOrderFactsToolDefinition()],
      toolChoice: { name: EXTRACT_ORDER_FACTS_TOOL_NAME },
    });

    if (response.type !== 'tool_calls' || response.toolCalls.length === 0) {
      return {
        itemProposals: [],
        customerFacts: [],
        fulfillmentFacts: [],
        commercialFacts: [],
        issues: [
          {
            code: 'NO_TOOL_CALL',
            message: 'Extractor did not return extract_order_facts tool call',
          },
        ],
      };
    }

    const call =
      response.toolCalls.find((entry) => entry.name === EXTRACT_ORDER_FACTS_TOOL_NAME) ??
      response.toolCalls[0];
    if (!call || call.name !== EXTRACT_ORDER_FACTS_TOOL_NAME) {
      return {
        itemProposals: [],
        customerFacts: [],
        fulfillmentFacts: [],
        commercialFacts: [],
        issues: [
          {
            code: 'WRONG_TOOL',
            message: `Unexpected extraction tool: ${call?.name ?? 'none'}`,
          },
        ],
      };
    }

    const parsed = parseExtractOrderFactsArguments(call.argumentsJson);
    if (!parsed.ok) {
      return {
        itemProposals: [],
        customerFacts: [],
        fulfillmentFacts: [],
        commercialFacts: [],
        issues: parsed.issues,
      };
    }
    return parsed.result;
  }
}
