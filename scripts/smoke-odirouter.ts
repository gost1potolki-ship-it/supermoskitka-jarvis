/**
 * Manual live smoke for OdiRouter gateway through Jarvis pipeline.
 * Not part of `npm test`. Requires ODIROUTER_API_KEY + ODIROUTER_MODEL.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

import { ConversationOrchestrator } from '../src/jarvis/conversation/index.js';
import { KnowledgeSystemPromptProvider } from '../src/knowledge/index.js';
import {
  OdiRouterConfigError,
  OdiRouterLlmProvider,
  OdiRouterProviderError,
  loadOdiRouterConfig,
} from '../src/llm/index.js';
import { InMemoryConversationStore } from '../src/storage/index.js';

loadEnv();

async function main(): Promise<void> {
  let config;
  try {
    config = loadOdiRouterConfig();
  } catch (error) {
    if (error instanceof OdiRouterConfigError) {
      console.error(error.message);
      console.error(
        'Set ODIROUTER_API_KEY and ODIROUTER_MODEL in .env (see .env.example), then re-run: npm run smoke:odirouter',
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
  const llm = new OdiRouterLlmProvider(config);
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

  try {
    const result = await orchestrator.handleIncomingMessage({
      conversationId,
      messageId: randomUUID(),
      text: 'Какие москитные сетки Вы можете предложить?',
    });

    if (result.status !== 'ai_replied') {
      console.error('provider: odirouter');
      console.error(`model: ${config.model}`);
      console.error('SMOKE FAIL: expected ai_replied, got', result.status);
      process.exitCode = 1;
      return;
    }

    const messages = await store.getMessages(conversationId);
    const aiSaved = messages.some(
      (message) => message.sender === 'AI' && message.text === result.replyText,
    );
    if (!aiSaved || result.replyText.trim() === '') {
      console.error('provider: odirouter');
      console.error(`model: ${config.model}`);
      console.error('SMOKE FAIL: AI response was not stored or was empty');
      process.exitCode = 1;
      return;
    }

    console.log('provider: odirouter');
    console.log(`model: ${config.model}`);
    console.log('response:');
    console.log(result.replyText);
    console.log('SMOKE: PASS');
  } catch (error) {
    if (error instanceof OdiRouterProviderError) {
      console.error('provider: odirouter');
      console.error(`model: ${error.model ?? config.model}`);
      if (error.status !== undefined) {
        console.error(`status: ${error.status}`);
      }
      console.error(`message: ${error.message}`);
      console.error('SMOKE: FAIL');
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown smoke failure';
  console.error('provider: odirouter');
  console.error('SMOKE FAIL:', message);
  process.exitCode = 1;
});
