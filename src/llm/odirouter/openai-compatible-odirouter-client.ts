import OpenAI from 'openai';

import type { OdiRouterConfig } from './odirouter-config.js';
import type {
  OdiRouterChatClient,
  OdiRouterChatCompletionInput,
  OdiRouterChatCompletionOutput,
} from './odirouter-chat-client.js';

/** Production wrapper around OpenAI SDK pointed at OdiRouter gateway. */
export class OpenAiCompatibleOdiRouterClient implements OdiRouterChatClient {
  readonly baseUrl: string;
  private readonly client: OpenAI;

  constructor(config: Pick<OdiRouterConfig, 'apiKey' | 'baseUrl'>) {
    this.baseUrl = config.baseUrl;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async createChatCompletion(
    input: OdiRouterChatCompletionInput,
  ): Promise<OdiRouterChatCompletionOutput> {
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
