import type {
  CalculationEngine,
  CalculationOutcome,
} from '../../calculation/index.js';
import type { LlmToolCall } from '../../llm/tool-calling-types.js';
import { applyMarginGuard } from '../preliminary/margin-guard.js';
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

export interface CalculationToolExecuteMeta {
  mode?: CalculationMode;
  outcome?: CalculationOutcome;
  guardedTotal?: number | null;
}

export function projectSafeCalculationOutcome(
  outcome: CalculationOutcome,
  mode?: CalculationMode,
  guardedTotal?: number | null,
): SafeToolResult {
  if (outcome.status === 'calculated') {
    const total = guardedTotal ?? outcome.total;
    return {
      status: 'calculated',
      total,
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

function applyPreliminaryMarginGuard(
  outcome: CalculationOutcome,
): { ok: true; total: number } | { ok: false; result: SafeToolResult } {
  const publicTotalRub = outcome.total;
  if (publicTotalRub === null || !Number.isFinite(publicTotalRub)) {
    return {
      ok: false,
      result: {
        status: 'tool_error',
        message:
          'The preliminary price cannot be completed safely right now. Ask the customer to wait or connect them with a manager.',
      },
    };
  }

  const guarded = applyMarginGuard({
    publicTotalRub,
    trustedDirectCostRub: outcome.trustedDirectCostRub,
  });

  if (!guarded.ok) {
    return {
      ok: false,
      result: {
        status: 'tool_error',
        message:
          'The preliminary price cannot be completed safely right now. Ask the customer to wait or connect them with a manager.',
      },
    };
  }

  return { ok: true, total: guarded.publicTotalRub };
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
  lastExecuteMeta: CalculationToolExecuteMeta | undefined;

  constructor(private readonly engine: CalculationEngine) {}

  async execute(call: LlmToolCall): Promise<SafeToolResult> {
    this.lastExecuteMeta = undefined;

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

      if (
        trusted.input.mode === 'PRELIMINARY_ALL_IN' &&
        outcome.status === 'calculated'
      ) {
        const margin = applyPreliminaryMarginGuard(outcome);
        if (!margin.ok) {
          return margin.result;
        }
        this.lastExecuteMeta = {
          mode: trusted.input.mode,
          outcome,
          guardedTotal: margin.total,
        };
        return projectSafeCalculationOutcome(outcome, trusted.input.mode, margin.total);
      }

      this.lastExecuteMeta = {
        mode: trusted.input.mode,
        outcome,
        guardedTotal: outcome.total,
      };
      return projectSafeCalculationOutcome(outcome, trusted.input.mode);
    } catch {
      return {
        status: 'tool_error',
        message: 'Calculation tool failed.',
      };
    }
  }
}
