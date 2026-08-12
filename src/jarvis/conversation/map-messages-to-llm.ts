import type { Message } from '../../domain/message.js';
import type { LlmChatMessage } from '../../llm/llm-provider.js';

export function mapMessagesToLlm(messages: readonly Message[]): LlmChatMessage[] {
  return messages.map((message) => ({
    role: mapSenderToLlmRole(message.sender),
    content: message.text,
  }));
}

function mapSenderToLlmRole(sender: Message['sender']): LlmChatMessage['role'] {
  switch (sender) {
    case 'CUSTOMER':
      return 'user';
    case 'AI':
    case 'HUMAN':
      return 'assistant';
    case 'SYSTEM':
      return 'system';
  }
}
