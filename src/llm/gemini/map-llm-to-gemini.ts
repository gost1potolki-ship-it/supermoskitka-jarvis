import type { LlmChatMessage } from '../llm-provider.js';

import type { GeminiContent } from './gemini-generate-client.js';
import { GeminiProviderError } from './gemini-errors.js';

const SYSTEM_SEPARATOR = '\n\n';

export interface MappedGeminiRequest {
  systemInstruction?: string;
  contents: GeminiContent[];
}

/**
 * Maps vendor-neutral LLM messages to Gemini generateContent shape.
 * system → systemInstruction (never fake user content)
 * user → user
 * assistant → model
 */
export function mapLlmMessagesToGemini(messages: LlmChatMessage[]): MappedGeminiRequest {
  const systemParts: string[] = [];
  const contents: GeminiContent[] = [];

  for (const message of messages) {
    switch (message.role) {
      case 'system':
        systemParts.push(message.content);
        break;
      case 'user':
        contents.push({
          role: 'user',
          parts: [{ text: message.content }],
        });
        break;
      case 'assistant':
        contents.push({
          role: 'model',
          parts: [{ text: message.content }],
        });
        break;
      default:
        throw new GeminiProviderError(
          'API_ERROR',
          `Unsupported LLM message role: ${String((message as { role: string }).role)}`,
        );
    }
  }

  if (systemParts.length === 0) {
    return { contents };
  }

  return {
    systemInstruction: systemParts.join(SYSTEM_SEPARATOR),
    contents,
  };
}
