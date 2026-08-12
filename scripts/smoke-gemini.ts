/**
 * Manual live smoke for Gemini Developer API through Jarvis pipeline.
 * Not part of `npm test`. Requires GEMINI_API_KEY + GEMINI_MODEL.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

import { ConversationOrchestrator } from '../src/jarvis/conversation/index.js';
import {
  GeminiConfigError,
  GeminiLlmProvider,
  loadGeminiConfig,
} from '../src/llm/index.js';
import {
  KnowledgeSystemPromptProvider,
  loadKnowledgeBase,
} from '../src/knowledge/index.js';
import { InMemoryConversationStore } from '../src/storage/index.js';

loadEnv();

async function main(): Promise<void> {
  let config;
  try {
    config = loadGeminiConfig();
  } catch (error) {
    if (error instanceof GeminiConfigError) {
      console.error(error.message);
      console.error(
        'Set GEMINI_API_KEY and GEMINI_MODEL in .env (see .env.example), then re-run: npm run smoke:gemini',
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const knowledgeRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../knowledge',
  );
  const knowledgeBase = await loadKnowledgeBase(knowledgeRoot);
  const store = new InMemoryConversationStore();
  const llm = new GeminiLlmProvider(config);
  const orchestrator = new ConversationOrchestrator(
    store,
    llm,
    new KnowledgeSystemPromptProvider(knowledgeBase),
  );

  const conversationId = randomUUID();
  const now = new Date().toISOString();
  await store.createConversation({
    conversationId,
    channel: 'unknown',
    customerId: 'smoke-customer',
    mode: 'AI',
    createdAt: now,
    updatedAt: now,
  });

  const result = await orchestrator.handleIncomingMessage({
    conversationId,
    messageId: randomUUID(),
    text: 'Какие виды москитных сеток Вы можете предложить?',
  });

  if (result.status !== 'ai_replied') {
    console.error('SMOKE FAIL: expected ai_replied, got', result.status);
    process.exitCode = 1;
    return;
  }

  const messages = await store.getMessages(conversationId);
  const aiSaved = messages.some(
    (message) => message.sender === 'AI' && message.text === result.replyText,
  );
  if (!aiSaved || result.replyText.trim() === '') {
    console.error('SMOKE FAIL: AI response was not stored or was empty');
    process.exitCode = 1;
    return;
  }

  console.log('provider: gemini');
  console.log(`model: ${config.model}`);
  console.log('response text:');
  console.log(result.replyText);
  console.log('SMOKE PASS');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown smoke failure';
  console.error('SMOKE FAIL:', message);
  process.exitCode = 1;
});
