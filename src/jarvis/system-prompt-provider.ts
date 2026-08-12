export interface SystemPromptProvider {
  getSystemPrompt(): Promise<string>;
}
