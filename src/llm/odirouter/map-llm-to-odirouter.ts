import type { LlmChatMessage } from '../llm-provider.js';

import type { OdiRouterChatMessage } from './odirouter-chat-client.js';
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
