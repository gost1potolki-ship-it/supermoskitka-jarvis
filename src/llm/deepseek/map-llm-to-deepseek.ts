import type { LlmChatMessage } from '../llm-provider.js';

import type { DeepSeekChatMessage } from './deepseek-chat-client.js';
import { DeepSeekProviderError } from './deepseek-errors.js';

/**
 * Maps vendor-neutral LLM messages to DeepSeek/OpenAI chat roles.
 * system → system, user → user, assistant → assistant (order preserved).
 */
export function mapLlmMessagesToDeepSeek(messages: LlmChatMessage[]): DeepSeekChatMessage[] {
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
        throw new DeepSeekProviderError(
          'API_ERROR',
          `Unsupported LLM message role: ${String((message as { role: string }).role)}`,
        );
    }
  });
}
