import type { LlmProvider, LlmRequest, LlmResponse } from '../llm-provider.js';

import type { OdiRouterChatClient } from './odirouter-chat-client.js';
import type { OdiRouterConfig } from './odirouter-config.js';
import { OdiRouterProviderError } from './odirouter-errors.js';
import { mapLlmMessagesToOdiRouter } from './map-llm-to-odirouter.js';
import { OpenAiCompatibleOdiRouterClient } from './openai-compatible-odirouter-client.js';

/**
 * Stateless OdiRouter gateway adapter (OpenAI-compatible chat completions).
 * Conversation history is supplied entirely by ConversationOrchestrator / ConversationStore.
 */
export class OdiRouterLlmProvider implements LlmProvider {
  private readonly model: string;
  private readonly client: OdiRouterChatClient;

  constructor(config: OdiRouterConfig, client?: OdiRouterChatClient) {
    if (config.apiKey.trim() === '') {
      throw new OdiRouterProviderError('CONFIG_ERROR', 'OdiRouter API key must not be empty');
    }
    if (config.model.trim() === '') {
      throw new OdiRouterProviderError('CONFIG_ERROR', 'OdiRouter model must not be empty');
    }
    if (config.baseUrl.trim() === '') {
      throw new OdiRouterProviderError('CONFIG_ERROR', 'OdiRouter base URL must not be empty');
    }

    this.model = config.model;
    this.client =
      client ??
      new OpenAiCompatibleOdiRouterClient({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const messages = mapLlmMessagesToOdiRouter(request.messages);

    try {
      const output = await this.client.createChatCompletion({
        model: this.model,
        messages,
      });

      const text = output.text?.trim() ?? '';
      if (text === '') {
        throw new OdiRouterProviderError('EMPTY_RESPONSE', 'OdiRouter returned an empty response', {
          model: this.model,
        });
      }

      return { text };
    } catch (error) {
      if (error instanceof OdiRouterProviderError) {
        throw error;
      }

      const status =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof (error as { status: unknown }).status === 'number'
          ? (error as { status: number }).status
          : undefined;

      throw new OdiRouterProviderError('API_ERROR', 'OdiRouter API request failed', {
        model: this.model,
        ...(status !== undefined ? { status } : {}),
      });
    }
  }
}
