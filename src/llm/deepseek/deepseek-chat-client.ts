/** Internal DeepSeek adapter types — not exported into Jarvis Core domains. */

export type DeepSeekChatRole = 'system' | 'user' | 'assistant';

export interface DeepSeekChatMessage {
  role: DeepSeekChatRole;
  content: string;
}

export interface DeepSeekChatCompletionInput {
  model: string;
  messages: DeepSeekChatMessage[];
}

export interface DeepSeekChatCompletionOutput {
  text: string | undefined;
}

export interface DeepSeekChatClient {
  createChatCompletion(input: DeepSeekChatCompletionInput): Promise<DeepSeekChatCompletionOutput>;
}
