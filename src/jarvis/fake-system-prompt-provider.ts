import type { SystemPromptProvider } from '../jarvis/system-prompt-provider.js';

/** Deterministic stub for ConversationOrchestrator tests. */
export class FakeSystemPromptProvider implements SystemPromptProvider {
  calls = 0;

  constructor(public prompt: string) {}

  async getSystemPrompt(): Promise<string> {
    this.calls += 1;
    return this.prompt;
  }
}
