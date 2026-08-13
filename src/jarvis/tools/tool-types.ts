import type { CalculationMode } from '../pricing/pricing-types.js';

export type ToolResultStatus =
  | 'calculated'
  | 'needs_input'
  | 'unsupported'
  | 'invalid_arguments'
  | 'unknown_tool'
  | 'tool_error';

/** @deprecated AI-facing results no longer include item breakdown. */
export interface SafeCalculationItemResult {
  itemId: string;
  productType: string;
  quantity: number;
  unitPrice: number;
  productTotal: number;
  installationTotal: number;
}

export interface SafeToolResult {
  status: ToolResultStatus;
  message?: string;
  total?: number | null;
  mode?: CalculationMode;
  missingFields?: string[];
  warnings?: string[];
  /** @deprecated Not projected to the LLM after Task 08.1. */
  items?: SafeCalculationItemResult[];
}

export const MAX_TOOL_ROUNDS = 3;
export const MAX_TOOL_CALLS_PER_TURN = 3;
