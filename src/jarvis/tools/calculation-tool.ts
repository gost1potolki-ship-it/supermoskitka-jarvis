import type {
  CalculationEngine,
  CalculationItemResult,
  CalculationOutcome,
  CalculationRequest,
} from '../../calculation/index.js';
import type { LlmToolCall } from '../../llm/tool-calling-types.js';

import {
  CALCULATE_ORDER_TOOL_NAME,
  createCalculateOrderToolDefinition,
} from './calculate-order-schema.js';
import type { SafeCalculationItemResult, SafeToolResult } from './tool-types.js';

function projectItem(item: CalculationItemResult): SafeCalculationItemResult {
  return {
    itemId: item.itemId,
    productType: item.productType,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    productTotal: item.productTotal,
    installationTotal: item.installationTotal,
  };
}

export function projectSafeCalculationOutcome(outcome: CalculationOutcome): SafeToolResult {
  const base: SafeToolResult = {
    status: outcome.status,
    total: outcome.total,
    items: outcome.items.map(projectItem),
    missingFields: [...outcome.missingFields],
    warnings: [...outcome.warnings],
  };

  if (outcome.status === 'calculated') {
    return {
      ...base,
      message:
        'Calculation completed. Reply to the customer with the total now. Do not call calculate_order again unless inputs change.',
    };
  }
  if (outcome.status === 'needs_input') {
    return {
      ...base,
      message:
        'Missing required fields. Ask the customer for missingFields. Do not invent values or prices.',
    };
  }
  if (outcome.status === 'unsupported') {
    return {
      ...base,
      message:
        'This configuration cannot be calculated automatically. Do not invent a price.',
    };
  }
  return base;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Minimal structural check before handing to CalculationEngine.
 * Engine remains the authoritative validator.
 */
export function parseCalculationRequestArguments(
  argumentsJson: string,
): { ok: true; request: CalculationRequest } | { ok: false; result: SafeToolResult } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argumentsJson);
  } catch {
    return {
      ok: false,
      result: {
        status: 'invalid_arguments',
        message: 'Calculation arguments are invalid.',
      },
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      result: {
        status: 'invalid_arguments',
        message: 'Calculation arguments are invalid.',
      },
    };
  }

  if (typeof parsed.customerType !== 'string' || !Array.isArray(parsed.items)) {
    return {
      ok: false,
      result: {
        status: 'invalid_arguments',
        message: 'Calculation arguments are invalid.',
      },
    };
  }

  // Trust boundary: cast only after JSON parse + shape check; engine validates deeply.
  return {
    ok: true,
    request: parsed as unknown as CalculationRequest,
  };
}

export class CalculationTool {
  readonly definition = createCalculateOrderToolDefinition();

  constructor(private readonly engine: CalculationEngine) {}

  async execute(call: LlmToolCall): Promise<SafeToolResult> {
    if (call.name !== CALCULATE_ORDER_TOOL_NAME) {
      return {
        status: 'unknown_tool',
        message: `Unknown tool: ${call.name}`,
      };
    }

    const parsed = parseCalculationRequestArguments(call.argumentsJson);
    if (!parsed.ok) {
      return parsed.result;
    }

    try {
      const outcome = await this.engine.calculate(parsed.request);
      return projectSafeCalculationOutcome(outcome);
    } catch {
      return {
        status: 'tool_error',
        message: 'Calculation tool failed.',
      };
    }
  }
}
