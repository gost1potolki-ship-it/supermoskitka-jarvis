import OpenAI from 'openai';

import type { DeepSeekConfig } from './deepseek-config.js';
import type {
  DeepSeekChatClient,
  DeepSeekChatCompletionInput,
  DeepSeekChatCompletionOutput,
} from './deepseek-chat-client.js';

/** Production wrapper around OpenAI SDK pointed at DeepSeek API. */
export class OpenAiCompatibleDeepSeekClient implements DeepSeekChatClient {
  readonly baseUrl: string;
  private readonly client: OpenAI;

  constructor(config: Pick<DeepSeekConfig, 'apiKey' | 'baseUrl'>) {
    this.baseUrl = config.baseUrl;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async createChatCompletion(
    input: DeepSeekChatCompletionInput,
  ): Promise<DeepSeekChatCompletionOutput> {
    const response = await this.client.chat.completions.create({
      model: input.model,
      messages: input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    const content = response.choices[0]?.message?.content;
    const text = typeof content === 'string' ? content : undefined;
    return { text };
  }
}
