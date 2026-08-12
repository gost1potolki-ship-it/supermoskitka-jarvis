/** Internal OdiRouter adapter types — not exported into Jarvis Core domains. */

export type OdiRouterChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface OdiRouterToolCallFunction {
  name: string;
  arguments: string;
}

export interface OdiRouterToolCall {
  id: string;
  type: 'function';
  function: OdiRouterToolCallFunction;
}

export interface OdiRouterChatMessage {
  role: OdiRouterChatRole;
  content?: string | null;
  tool_calls?: OdiRouterToolCall[];
  tool_call_id?: string;
}

export interface OdiRouterToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OdiRouterChatCompletionInput {
  model: string;
  messages: OdiRouterChatMessage[];
  tools?: OdiRouterToolDefinition[];
  tool_choice?: 'auto' | 'none';
}

export interface OdiRouterChatCompletionOutput {
  text: string | undefined;
  toolCalls: OdiRouterToolCall[];
}

export interface OdiRouterChatClient {
  createChatCompletion(
    input: OdiRouterChatCompletionInput,
  ): Promise<OdiRouterChatCompletionOutput>;
}
