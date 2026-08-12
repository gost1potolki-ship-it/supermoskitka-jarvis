/**
 * Manual live smoke for DeepSeek API through Jarvis pipeline.
 * Not part of `npm test`. Requires DEEPSEEK_API_KEY + DEEPSEEK_MODEL.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

import { ConversationOrchestrator } from '../src/jarvis/conversation/index.js';
import { KnowledgeSystemPromptProvider } from '../src/knowledge/index.js';
import {
  DeepSeekConfigError,
  DeepSeekLlmProvider,
  DeepSeekProviderError,
  loadDeepSeekConfig,
} from '../src/llm/index.js';
import { InMemoryConversationStore } from '../src/storage/index.js';

loadEnv();

async function main(): Promise<void> {
  let config;
  try {
    config = loadDeepSeekConfig();
  } catch (error) {
    if (error instanceof DeepSeekConfigError) {
      console.error(error.message);
      console.error(
        'Set DEEPSEEK_API_KEY and DEEPSEEK_MODEL in .env (see .env.example), then re-run: npm run smoke:deepseek',
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
  const store = new InMemoryConversationStore();
  const llm = new DeepSeekLlmProvider(config);
  const orchestrator = new ConversationOrchestrator(
    store,
    llm,
    new KnowledgeSystemPromptProvider(knowledgeRoot),
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
    text: 'Какие москитные сетки Вы можете предложить?',
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

  console.log('provider: deepseek');
  console.log(`model: ${config.model}`);
  console.log('response:');
  console.log(result.replyText);
  console.log('SMOKE: PASS');
}

main().catch((error: unknown) => {
  if (error instanceof DeepSeekProviderError) {
    console.error('SMOKE FAIL:', error.message);
    if (error.status !== undefined) {
      console.error('status:', error.status);
    }
    if (error.model !== undefined) {
      console.error('model:', error.model);
    }
    process.exitCode = 1;
    return;
  }
  const message = error instanceof Error ? error.message : 'Unknown smoke failure';
  console.error('SMOKE FAIL:', message);
  process.exitCode = 1;
});
