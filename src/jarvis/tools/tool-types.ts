export type ToolResultStatus =
  | 'calculated'
  | 'needs_input'
  | 'unsupported'
  | 'invalid_arguments'
  | 'unknown_tool'
  | 'tool_error';

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
  items?: SafeCalculationItemResult[];
  missingFields?: string[];
  warnings?: string[];
}

export const MAX_TOOL_ROUNDS = 3;
export const MAX_TOOL_CALLS_PER_TURN = 3;
