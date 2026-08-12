import OpenAI from 'openai';

import type { OdiRouterConfig } from './odirouter-config.js';
import type {
  OdiRouterChatClient,
  OdiRouterChatCompletionInput,
  OdiRouterChatCompletionOutput,
  OdiRouterToolCall,
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
      messages: input.messages.map((message) => {
        if (message.role === 'tool') {
          return {
            role: 'tool' as const,
            tool_call_id: message.tool_call_id ?? '',
            content: message.content ?? '',
          };
        }
        if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
          return {
            role: 'assistant' as const,
            content: message.content ?? null,
            tool_calls: message.tool_calls.map((call) => ({
              id: call.id,
              type: 'function' as const,
              function: {
                name: call.function.name,
                arguments: call.function.arguments,
              },
            })),
          };
        }
        return {
          role: message.role,
          content: message.content ?? '',
        };
      }),
      ...(input.tools !== undefined
        ? {
            tools: input.tools,
            tool_choice: input.tool_choice ?? 'auto',
          }
        : {}),
    });

    const message = response.choices[0]?.message;
    const content = message?.content;
    const text = typeof content === 'string' ? content : undefined;
    const toolCalls: OdiRouterToolCall[] = (message?.tool_calls ?? [])
      .filter((call) => call.type === 'function')
      .map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: {
          name: call.function.name,
          arguments: call.function.arguments,
        },
      }));

    return { text, toolCalls };
  }
}
