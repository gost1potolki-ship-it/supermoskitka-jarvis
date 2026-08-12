import type { LlmProvider, LlmRequest, LlmResponse } from '../llm-provider.js';

import type { DeepSeekChatClient } from './deepseek-chat-client.js';
import type { DeepSeekConfig } from './deepseek-config.js';
import { DeepSeekProviderError } from './deepseek-errors.js';
import { mapLlmMessagesToDeepSeek } from './map-llm-to-deepseek.js';
import { OpenAiCompatibleDeepSeekClient } from './openai-compatible-deepseek-client.js';

/**
 * Stateless DeepSeek API adapter (OpenAI-compatible chat completions).
 * Conversation history is supplied entirely by ConversationOrchestrator / ConversationStore.
 */
export class DeepSeekLlmProvider implements LlmProvider {
  private readonly model: string;
  private readonly client: DeepSeekChatClient;

  constructor(config: DeepSeekConfig, client?: DeepSeekChatClient) {
    if (config.apiKey.trim() === '') {
      throw new DeepSeekProviderError('CONFIG_ERROR', 'DeepSeek API key must not be empty');
    }
    if (config.model.trim() === '') {
      throw new DeepSeekProviderError('CONFIG_ERROR', 'DeepSeek model must not be empty');
    }
    if (config.baseUrl.trim() === '') {
      throw new DeepSeekProviderError('CONFIG_ERROR', 'DeepSeek base URL must not be empty');
    }

    this.model = config.model;
    this.client =
      client ??
      new OpenAiCompatibleDeepSeekClient({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const messages = mapLlmMessagesToDeepSeek(request.messages);

    try {
      const output = await this.client.createChatCompletion({
        model: this.model,
        messages,
      });

      const text = output.text?.trim() ?? '';
      if (text === '') {
        throw new DeepSeekProviderError('EMPTY_RESPONSE', 'DeepSeek returned an empty response', {
          model: this.model,
        });
      }

      return { text };
    } catch (error) {
      if (error instanceof DeepSeekProviderError) {
        throw error;
      }

      const status =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof (error as { status: unknown }).status === 'number'
          ? (error as { status: number }).status
          : undefined;

      throw new DeepSeekProviderError('API_ERROR', 'DeepSeek API request failed', {
        model: this.model,
        ...(status !== undefined ? { status } : {}),
      });
    }
  }
}
