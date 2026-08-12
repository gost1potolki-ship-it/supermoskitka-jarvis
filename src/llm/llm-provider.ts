export type LlmChatRole = 'system' | 'user' | 'assistant';

export interface LlmChatMessage {
  role: LlmChatRole;
  content: string;
}

export interface LlmRequest {
  conversationId: string;
  messages: LlmChatMessage[];
}

export interface LlmResponse {
  text: string;
}

export interface LlmProvider {
  generate(request: LlmRequest): Promise<LlmResponse>;
}
