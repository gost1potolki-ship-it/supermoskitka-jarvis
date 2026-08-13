import type { LlmProvider, LlmRequest, LlmResponse } from './llm-provider.js';

/** Deterministic scripted LLM for retry / failure regressions. */
export class ScriptedLlmProvider implements LlmProvider {
  readonly requests: LlmRequest[] = [];
  private step = 0;

  constructor(private readonly script: Array<string | Error>) {
    if (script.length === 0) {
      throw new Error('ScriptedLlmProvider requires at least one script step');
    }
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push({
      conversationId: request.conversationId,
      messages: request.messages.map((message) => ({ ...message })),
    });
    const next = this.script[Math.min(this.step, this.script.length - 1)]!;
    this.step += 1;
    if (next instanceof Error) {
      throw next;
    }
    return { text: next };
  }
}
