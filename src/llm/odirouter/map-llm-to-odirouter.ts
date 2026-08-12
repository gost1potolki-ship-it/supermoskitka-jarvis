import type {
  LlmToolCall,
  LlmToolConversationMessage,
  LlmToolDefinition,
} from '../tool-calling-types.js';
import type { LlmChatMessage } from '../llm-provider.js';

import type {
  OdiRouterChatMessage,
  OdiRouterToolCall,
  OdiRouterToolDefinition,
} from './odirouter-chat-client.js';
import { OdiRouterProviderError } from './odirouter-errors.js';

/**
 * Maps vendor-neutral LLM messages to OpenAI-compatible chat roles.
 * system → system, user → user, assistant → assistant (order preserved).
 */
export function mapLlmMessagesToOdiRouter(messages: LlmChatMessage[]): OdiRouterChatMessage[] {
  return messages.map((message) => {
    switch (message.role) {
      case 'system':
      case 'user':
      case 'assistant':
        return {
          role: message.role,
          content: message.content,
        };
      default:
        throw new OdiRouterProviderError(
          'API_ERROR',
          `Unsupported LLM message role: ${String((message as { role: string }).role)}`,
        );
    }
  });
}

export function mapNeutralToolsToOdiRouter(
  tools: LlmToolDefinition[],
): OdiRouterToolDefinition[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function mapToolConversationToOdiRouter(
  messages: LlmToolConversationMessage[],
): OdiRouterChatMessage[] {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
      };
    }

    if (message.role === 'assistant') {
      const toolCalls = message.toolCalls?.map(mapNeutralToolCallToOdiRouter);
      return {
        role: 'assistant',
        content: message.content ?? null,
        ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}

export function mapNeutralToolCallToOdiRouter(call: LlmToolCall): OdiRouterToolCall {
  return {
    id: call.id,
    type: 'function',
    function: {
      name: call.name,
      arguments: call.argumentsJson,
    },
  };
}

export function mapOdiRouterToolCallsToNeutral(calls: OdiRouterToolCall[]): LlmToolCall[] {
  return calls.map((call) => ({
    id: call.id,
    name: call.function.name,
    argumentsJson: call.function.arguments,
  }));
}
