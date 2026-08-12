import type { SystemPromptProvider } from '../jarvis/system-prompt-provider.js';
import { JARVIS_BASE_SYSTEM_INSTRUCTIONS } from '../jarvis/system-prompt.js';

import { buildKnowledgeContext } from './knowledge-context-builder.js';
import { defaultKnowledgeRoot, loadKnowledgeBase } from './knowledge-loader.js';

/**
 * Builds the runtime system prompt from current approved Knowledge Base.
 * Reloads knowledge on every call so approved updates are visible without
 * rewriting conversation history.
 */
export class KnowledgeSystemPromptProvider implements SystemPromptProvider {
  constructor(private readonly knowledgeRoot: string = defaultKnowledgeRoot()) {}

  async getSystemPrompt(): Promise<string> {
    const knowledgeBase = await loadKnowledgeBase(this.knowledgeRoot);
    const knowledgeContext = buildKnowledgeContext(knowledgeBase.getApprovedRules());
    return `${JARVIS_BASE_SYSTEM_INSTRUCTIONS}\n\n${knowledgeContext}`;
  }
}
