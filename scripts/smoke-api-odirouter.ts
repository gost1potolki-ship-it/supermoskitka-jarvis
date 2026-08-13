/**
 * Live HTTP application API smoke via OdiRouter.
 * Not part of `npm test`. Requires:
 *   ODIROUTER_API_KEY
 *   ODIROUTER_MODEL
 *   JARVIS_INTERNAL_API_KEY (local smoke value is generated if unset)
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

import { JarvisApplication } from '../src/application/index.js';
import { createApp } from '../src/app/server.js';
import { createLogger } from '../src/app/logger.js';
import { ConversationOrchestrator } from '../src/jarvis/conversation/index.js';
import { KnowledgeSystemPromptProvider } from '../src/knowledge/index.js';
import {
  OdiRouterConfigError,
  OdiRouterLlmProvider,
  OdiRouterProviderError,
  loadOdiRouterConfig,
} from '../src/llm/index.js';
import {
  InMemoryConversationStore,
  InMemoryOrderMemoryStore,
} from '../src/storage/index.js';

loadEnv();

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadOdiRouterConfig();
  } catch (error) {
    if (error instanceof OdiRouterConfigError) {
      console.error(error.message);
      console.error(
        'Set ODIROUTER_API_KEY and ODIROUTER_MODEL in .env, then re-run: npm run smoke:api:odirouter',
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const apiKey = process.env.JARVIS_INTERNAL_API_KEY?.trim() || `smoke-${randomUUID()}`;
  const knowledgeRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../knowledge',
  );
  const conversationStore = new InMemoryConversationStore();
  const orderMemoryStore = new InMemoryOrderMemoryStore();
  const llm = new OdiRouterLlmProvider(config);
  const orchestrator = new ConversationOrchestrator(
    conversationStore,
    llm,
    new KnowledgeSystemPromptProvider(knowledgeRoot),
    { orderMemoryStore },
  );
  const application = new JarvisApplication({
    conversationStore,
    orderMemoryStore,
    orchestrator,
  });
  const app = createApp(createLogger('error'), {
    application,
    internalApiKey: apiKey,
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind ephemeral port');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const createRes = await fetch(`${baseUrl}/internal/v1/conversations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ channel: 'unknown' }),
    });
    const created = (await readJson(createRes)) as { conversationId?: string };
    if (createRes.status !== 201 || !created.conversationId) {
      console.error('provider: odirouter');
      console.error(`model: ${config.model}`);
      console.error('SMOKE FAIL: create conversation', createRes.status);
      process.exitCode = 1;
      return;
    }

    const messageRes = await fetch(
      `${baseUrl}/internal/v1/conversations/${created.conversationId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messageId: randomUUID(),
          text: 'Здравствуйте! Какие москитные сетки вы можете предложить?',
        }),
      },
    );
    const messageBody = (await readJson(messageRes)) as {
      aiReply?: { text?: string } | null;
      conversationMode?: string;
    };
    if (
      messageRes.status !== 200 ||
      !messageBody.aiReply?.text ||
      messageBody.aiReply.text.trim() === ''
    ) {
      console.error('provider: odirouter');
      console.error(`model: ${config.model}`);
      console.error('SMOKE FAIL: expected non-empty AI reply', messageRes.status);
      process.exitCode = 1;
      return;
    }

    const stateRes = await fetch(
      `${baseUrl}/internal/v1/conversations/${created.conversationId}/order-state`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
    if (stateRes.status !== 200) {
      console.error('provider: odirouter');
      console.error(`model: ${config.model}`);
      console.error('SMOKE FAIL: order-state', stateRes.status);
      process.exitCode = 1;
      return;
    }

    const modeRes = await fetch(
      `${baseUrl}/internal/v1/conversations/${created.conversationId}/mode`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ mode: 'HUMAN' }),
      },
    );
    if (modeRes.status !== 200) {
      console.error('provider: odirouter');
      console.error(`model: ${config.model}`);
      console.error('SMOKE FAIL: set HUMAN', modeRes.status);
      process.exitCode = 1;
      return;
    }

    const humanMsg = await fetch(
      `${baseUrl}/internal/v1/conversations/${created.conversationId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messageId: randomUUID(),
          text: 'Передайте менеджеру, пожалуйста',
        }),
      },
    );
    const humanBody = (await readJson(humanMsg)) as {
      aiReply?: unknown;
      conversationMode?: string;
    };
    if (
      humanMsg.status !== 200 ||
      humanBody.conversationMode !== 'HUMAN' ||
      humanBody.aiReply !== null
    ) {
      console.error('provider: odirouter');
      console.error(`model: ${config.model}`);
      console.error('SMOKE FAIL: HUMAN silence expected');
      process.exitCode = 1;
      return;
    }

    console.log('provider: odirouter');
    console.log(`model: ${config.model}`);
    console.log('API SMOKE: PASS');
  } catch (error) {
    if (error instanceof OdiRouterProviderError) {
      console.error('provider: odirouter');
      console.error(`model: ${error.model ?? config.model}`);
      console.error('SMOKE FAIL: provider error');
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error('SMOKE FAIL: unexpected error');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
