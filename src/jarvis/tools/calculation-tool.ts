import type {
  CalculationEngine,
  CalculationOutcome,
} from '../../calculation/index.js';
import type { OrderMemory } from '../../domain/index.js';
import type { LlmToolCall } from '../../llm/tool-calling-types.js';
import {
  buildCalculationRequestFromTrustedPreliminaryInput,
  buildTrustedPreliminaryCalculationInput,
  llmDimensionsConflictWithTrusted,
} from '../preliminary/trusted-preliminary-calculation.js';
import {
  createTrustedPreliminaryQuoteProof,
  type TrustedPreliminaryQuoteProof,
} from '../preliminary/guarded-preliminary-price.js';
import {
  buildCalculationRequestFromTrustedInput,
  parseTrustedCalculationToolInput,
  type CalculationMode,
  type TrustedCalculationToolInput,
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
  guardedPrice?: TrustedPreliminaryQuoteProof;
  deliveryType?: 'city' | 'out' | 'pickup';
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

function failPreliminaryGuard(): SafeToolResult {
  return {
    status: 'tool_error',
    message:
      'The preliminary price cannot be completed safely right now. Ask the customer to wait or connect them with a manager.',
  };
}

function trustedBuildFailure(code: string, missingFields?: string[]): SafeToolResult {
  if (code === 'NEEDS_INPUT' || code === 'NEEDS_SIZE_BASIS') {
    return {
      status: 'needs_input',
      missingFields: missingFields ?? [code === 'NEEDS_SIZE_BASIS' ? 'measurementBasis' : 'items'],
      warnings: [],
      message:
        'Missing required fields. Ask the customer for missingFields. Do not invent values or prices.',
    };
  }
  return failPreliminaryGuard();
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
  private orderMemoryContext: OrderMemory | undefined;

  constructor(private readonly engine: CalculationEngine) {}

  setOrderMemoryContext(memory: OrderMemory | undefined): void {
    this.orderMemoryContext = memory;
  }

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

    try {
      if (
        trusted.input.mode === 'PRELIMINARY_ALL_IN' &&
        this.orderMemoryContext !== undefined
      ) {
        return this.executePreliminaryAllInFromMemory(trusted.input);
      }

      const built = buildCalculationRequestFromTrustedInput(trusted.input);
      if (!built.ok) {
        return built.result;
      }

      const outcome = await this.engine.calculate(built.request);

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

  private async executePreliminaryAllInFromMemory(
    toolInput: TrustedCalculationToolInput,
  ): Promise<SafeToolResult> {
    const memory = this.orderMemoryContext!;
    const built = buildTrustedPreliminaryCalculationInput(memory, toolInput.delivery);
    if (!built.ok) {
      return trustedBuildFailure(built.code, built.missingFields);
    }

    void llmDimensionsConflictWithTrusted(memory, toolInput.items);

    const request = buildCalculationRequestFromTrustedPreliminaryInput(built.input);
    const outcome = await this.engine.calculate(request);

    if (outcome.status !== 'calculated') {
      return projectSafeCalculationOutcome(outcome, toolInput.mode);
    }

    const trustedQuote = createTrustedPreliminaryQuoteProof({
      memory,
      outcome,
      trustedInput: built.input,
    });

    if (!trustedQuote.ok) {
      return failPreliminaryGuard();
    }

    this.lastExecuteMeta = {
      mode: toolInput.mode,
      outcome,
      guardedTotal: trustedQuote.proof.publicTotalRub,
      guardedPrice: trustedQuote.proof,
      deliveryType: built.input.delivery.type,
    };

    return projectSafeCalculationOutcome(
      outcome,
      toolInput.mode,
      trustedQuote.proof.publicTotalRub,
    );
  }
}
