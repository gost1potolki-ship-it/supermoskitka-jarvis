import type { LlmToolCall, LlmToolDefinition } from '../../llm/tool-calling-types.js';

import type { CalculationTool } from './calculation-tool.js';
import { CALCULATE_ORDER_TOOL_NAME } from './calculate-order-schema.js';
import type { SafeToolResult } from './tool-types.js';

export class ToolRuntime {
  constructor(private readonly calculationTool: CalculationTool) {}

  getToolDefinitions(): LlmToolDefinition[] {
    return [this.calculationTool.definition];
  }

  async executeToolCall(call: LlmToolCall): Promise<SafeToolResult> {
    if (call.name !== CALCULATE_ORDER_TOOL_NAME) {
      return {
        status: 'unknown_tool',
        message: `Unknown tool: ${call.name}`,
      };
    }
    return this.calculationTool.execute(call);
  }

  getLastCalculationMeta() {
    return this.calculationTool.lastExecuteMeta;
  }

  serializeToolResult(result: SafeToolResult): string {
    return JSON.stringify(result);
  }
}
