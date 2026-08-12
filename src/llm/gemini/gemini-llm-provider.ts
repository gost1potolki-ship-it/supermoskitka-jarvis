import type { LlmProvider, LlmRequest, LlmResponse } from '../llm-provider.js';

import type { GeminiConfig } from './gemini-config.js';
import type { GeminiGenerateClient } from './gemini-generate-client.js';
import { GeminiProviderError } from './gemini-errors.js';
import { mapLlmMessagesToGemini } from './map-llm-to-gemini.js';
import { GoogleGenAiGenerateClient } from './google-genai-generate-client.js';

/**
 * Stateless Gemini Developer API adapter.
 * Conversation history is supplied entirely by ConversationOrchestrator / ConversationStore.
 */
export class GeminiLlmProvider implements LlmProvider {
  private readonly model: string;
  private readonly client: GeminiGenerateClient;

  constructor(config: GeminiConfig, client?: GeminiGenerateClient) {
    if (config.apiKey.trim() === '') {
      throw new GeminiProviderError('CONFIG_ERROR', 'Gemini API key must not be empty');
    }
    if (config.model.trim() === '') {
      throw new GeminiProviderError('CONFIG_ERROR', 'Gemini model must not be empty');
    }

    this.model = config.model;
    this.client = client ?? new GoogleGenAiGenerateClient({ apiKey: config.apiKey });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const mapped = mapLlmMessagesToGemini(request.messages);

    try {
      const output = await this.client.generateContent({
        model: this.model,
        contents: mapped.contents,
        ...(mapped.systemInstruction !== undefined
          ? { systemInstruction: mapped.systemInstruction }
          : {}),
      });

      const text = output.text?.trim() ?? '';
      if (text === '') {
        throw new GeminiProviderError('EMPTY_RESPONSE', 'Gemini returned an empty response', {
          model: this.model,
        });
      }

      return { text };
    } catch (error) {
      if (error instanceof GeminiProviderError) {
        throw error;
      }

      throw new GeminiProviderError('API_ERROR', 'Gemini API request failed', {
        model: this.model,
      });
    }
  }
}
