/** Provider-neutral tool-calling contract. No OpenAI/OdiRouter types. */

export type JsonSchema = Record<string, unknown>;

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface LlmToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

export type LlmToolConversationMessage =
  | {
      role: 'system' | 'user';
      content: string;
    }
  | {
      role: 'assistant';
      content?: string;
      toolCalls?: LlmToolCall[];
    }
  | {
      role: 'tool';
      toolCallId: string;
      content: string;
    };

export interface LlmToolRequest {
  conversationId: string;
  messages: LlmToolConversationMessage[];
  tools: LlmToolDefinition[];
  /** Defaults to auto. Use none after tools executed to force a final text answer. */
  toolChoice?: 'auto' | 'none';
}

export type LlmToolResponse =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'tool_calls';
      toolCalls: LlmToolCall[];
      content?: string;
    };
