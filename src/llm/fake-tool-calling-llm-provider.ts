import type { LlmProvider, LlmRequest, LlmResponse } from './llm-provider.js';
import type {
  LlmToolCall,
  LlmToolRequest,
  LlmToolResponse,
} from './tool-calling-types.js';

/** Scripted tool-capable stub for ConversationOrchestrator tests. */
export class FakeToolCallingLlmProvider implements LlmProvider {
  readonly requests: LlmRequest[] = [];
  readonly toolRequests: LlmToolRequest[] = [];
  private step = 0;

  constructor(
    private readonly script: Array<LlmToolResponse | { type: 'text'; text: string }>,
  ) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push({
      conversationId: request.conversationId,
      messages: request.messages.map((message) => ({ ...message })),
    });
    const next = this.script[this.step++] ?? { type: 'text' as const, text: 'fallback' };
    if (next.type !== 'text') {
      throw new Error('FakeToolCallingLlmProvider.generate expected text response');
    }
    return { text: next.text };
  }

  async generateWithTools(request: LlmToolRequest): Promise<LlmToolResponse> {
    this.toolRequests.push({
      conversationId: request.conversationId,
      tools: request.tools.map((tool) => ({ ...tool, parameters: { ...tool.parameters } })),
      messages: request.messages.map((message) => structuredClone(message)),
    });
    const next = this.script[this.step++];
    if (!next) {
      return { type: 'text', text: 'no scripted response' };
    }
    return next;
  }
}

export function fakeCalculateOrderCall(
  id: string,
  args: Record<string, unknown>,
): LlmToolCall {
  return {
    id,
    name: 'calculate_order',
    argumentsJson: JSON.stringify(args),
  };
}
