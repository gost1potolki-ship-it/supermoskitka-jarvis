import type { LlmProvider, LlmRequest, LlmResponse } from './llm-provider.js';

/** Deterministic stub for tests and local orchestration checks. */
export class FakeLlmProvider implements LlmProvider {
  readonly requests: LlmRequest[] = [];

  constructor(private readonly responseText: string) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push({
      conversationId: request.conversationId,
      messages: request.messages.map((message) => ({ ...message })),
    });
    return { text: this.responseText };
  }
}
