import type { LlmToolRequest, LlmToolResponse } from './tool-calling-types.js';

export type LlmChatRole = 'system' | 'user' | 'assistant';

export interface LlmChatMessage {
  role: LlmChatRole;
  content: string;
}

export interface LlmRequest {
  conversationId: string;
  messages: LlmChatMessage[];
}

export interface LlmResponse {
  text: string;
}

export interface LlmProvider {
  generate(request: LlmRequest): Promise<LlmResponse>;
  /**
   * Optional tool-calling capability.
   * When ConversationOrchestrator enables tools, this method is required.
   */
  generateWithTools?(request: LlmToolRequest): Promise<LlmToolResponse>;
}

export function isToolCallingLlmProvider(
  provider: LlmProvider,
): provider is LlmProvider & {
  generateWithTools: (request: LlmToolRequest) => Promise<LlmToolResponse>;
} {
  return typeof provider.generateWithTools === 'function';
}
