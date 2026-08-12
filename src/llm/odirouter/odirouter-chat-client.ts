/** Internal OdiRouter adapter types — not exported into Jarvis Core domains. */

export type OdiRouterChatRole = 'system' | 'user' | 'assistant';

export interface OdiRouterChatMessage {
  role: OdiRouterChatRole;
  content: string;
}

export interface OdiRouterChatCompletionInput {
  model: string;
  messages: OdiRouterChatMessage[];
}

export interface OdiRouterChatCompletionOutput {
  text: string | undefined;
}

export interface OdiRouterChatClient {
  createChatCompletion(
    input: OdiRouterChatCompletionInput,
  ): Promise<OdiRouterChatCompletionOutput>;
}
