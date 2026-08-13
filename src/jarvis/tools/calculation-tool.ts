import type {
  CalculationEngine,
  CalculationOutcome,
} from '../../calculation/index.js';
import type { LlmToolCall } from '../../llm/tool-calling-types.js';
import {
  buildCalculationRequestFromTrustedInput,
  parseTrustedCalculationToolInput,
  type CalculationMode,
} from '../pricing/index.js';

import {
  CALCULATE_ORDER_TOOL_NAME,
  createCalculateOrderToolDefinition,
} from './calculate-order-schema.js';
import type { SafeToolResult } from './tool-types.js';

export function projectSafeCalculationOutcome(
  outcome: CalculationOutcome,
  mode?: CalculationMode,
): SafeToolResult {
  if (outcome.status === 'calculated') {
    return {
      status: 'calculated',
      total: outcome.total,
      ...(mode !== undefined ? { mode } : {}),
      ...(outcome.warnings.length > 0 ? { warnings: [...outcome.warnings] } : {}),
      message:
        'Calculation completed. Reply to the customer with the total now. Do not call calculate_order again unless inputs change. Do not change the total.',
    };
  }

  if (outcome.status === 'needs_input') {
    return {
      status: 'needs_input',
      missingFields: [...outcome.missingFields],
      warnings: [...outcome.warnings],
      message:
        'Missing required fields. Ask the customer for missingFields. Do not invent values or prices.',
    };
  }

  if (outcome.status === 'unsupported') {
    return {
      status: 'unsupported',
      warnings: [...outcome.warnings],
      message:
        'This configuration cannot be calculated automatically. Do not invent a price.',
    };
  }

  return {
    status: outcome.status,
    message: 'Calculation completed with an unexpected status.',
  };
}

/**
 * @deprecated Prefer parseTrustedCalculationToolInput + buildCalculationRequestFromTrustedInput.
 * Kept as a thin alias for tests that assert invalid JSON rejection.
 */
export function parseCalculationRequestArguments(
  argumentsJson: string,
): { ok: true; request: unknown } | { ok: false; result: SafeToolResult } {
  const trusted = parseTrustedCalculationToolInput(argumentsJson);
  if (!trusted.ok) {
    return trusted;
  }
  const built = buildCalculationRequestFromTrustedInput(trusted.input);
  if (!built.ok) {
    return built;
  }
  return { ok: true, request: built.request };
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

    const trusted = parseTrustedCalculationToolInput(call.argumentsJson);
    if (!trusted.ok) {
      return trusted.result;
    }

    const built = buildCalculationRequestFromTrustedInput(trusted.input);
    if (!built.ok) {
      return built.result;
    }

    try {
      const outcome = await this.engine.calculate(built.request);
      return projectSafeCalculationOutcome(outcome, trusted.input.mode);
    } catch {
      return {
        status: 'tool_error',
        message: 'Calculation tool failed.',
      };
    }
  }
}
