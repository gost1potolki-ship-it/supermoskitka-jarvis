/**
 * Live smoke: OdiRouter preliminary readiness path.
 * Requires ODIROUTER_API_KEY + ODIROUTER_MODEL when running full scenario.
 */
import { randomUUID } from 'node:crypto';

import { config as loadEnv } from 'dotenv';

import { getFactValue } from '../src/domain/index.js';
import {
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
} from '../src/calculation/index.js';
import { ConversationOrchestrator } from '../src/jarvis/conversation/index.js';
import { FakeFactExtractor, emptyExtraction } from '../src/jarvis/extraction/index.js';
import { KnowledgeSystemPromptProvider } from '../src/knowledge/index.js';
import { evaluateLeadReadiness } from '../src/jarvis/preliminary/index.js';
import { CalculationTool, ToolRuntime } from '../src/jarvis/tools/index.js';
import {
  OdiRouterConfigError,
  OdiRouterLlmProvider,
  OdiRouterProviderError,
  loadOdiRouterConfig,
} from '../src/llm/index.js';
import { InMemoryConversationStore, InMemoryOrderMemoryStore } from '../src/storage/index.js';
import { CURRENT_PRICE_CATALOG } from '../tests/fixtures/calculation-prices-current.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

loadEnv();

async function main(): Promise<void> {
  let config;
  try {
    config = loadOdiRouterConfig();
  } catch (error) {
    if (error instanceof OdiRouterConfigError) {
      console.log('SMOKE: NOT RUN — ODIROUTER_CONFIG_MISSING');
      return;
    }
    throw error;
  }

  const knowledgeRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../knowledge',
  );
  const store = new InMemoryConversationStore();
  const memoryStore = new InMemoryOrderMemoryStore();
  const engine = new SuperMoskitkaCalculationEngine(
    new StaticPriceCatalogProvider({
      version: 'current-prices-base@66465b1',
      prices: CURRENT_PRICE_CATALOG,
      businessRulesVersion: CURRENT_BUSINESS_RULES_VERSION,
      businessRules: CURRENT_BUSINESS_RULES,
    }),
  );
  const toolRuntime = new ToolRuntime(new CalculationTool(engine));
  const llm = new OdiRouterLlmProvider(config);
  const orchestrator = new ConversationOrchestrator(
    store,
    llm,
    new KnowledgeSystemPromptProvider(knowledgeRoot),
    {
      toolRuntime,
      factExtractor: new FakeFactExtractor([emptyExtraction()]),
      orderMemoryStore: memoryStore,
    },
  );

  const conversationId = randomUUID();
  const now = new Date().toISOString();
  await store.createConversation({
    conversationId,
    channel: 'unknown',
    customerId: 'smoke-readiness',
    mode: 'AI',
    createdAt: now,
    updatedAt: now,
  });

  console.log('provider: odirouter');
  console.log(`model: ${config.model}`);

  const turn = await orchestrator.handleIncomingMessage({
    conversationId,
    messageId: randomUUID(),
    text: 'Сколько стоит одна рамочная сетка белая под ключ с замером?',
  });

  const memory = await memoryStore.get(conversationId);
  const readiness = memory ? evaluateLeadReadiness(memory) : null;

  console.log(`turn status: ${turn.status}`);
  console.log(`items: ${memory?.items.length ?? 0}`);
  console.log(`preliminaryQuote: ${memory?.preliminaryQuote?.quoteId ?? '(none)'}`);
  console.log(`readiness: ${readiness?.status ?? '(none)'}`);
  if (readiness && readiness.blockingCodes.length > 0) {
    console.log(`blocking: ${readiness.blockingCodes.join(', ')}`);
  }

  const item = memory?.items[0];
  const avgNotStored =
    getFactValue(item?.widthMm) === undefined && getFactValue(item?.heightMm) === undefined;

  if (turn.status === 'ai_replied' && avgNotStored) {
    console.log('SMOKE: PASS');
    return;
  }

  console.error('SMOKE: FAIL');
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  if (error instanceof OdiRouterProviderError) {
    console.error(`provider error: ${error.message}`);
    console.error('SMOKE: FAIL');
    process.exitCode = 1;
    return;
  }
  const message = error instanceof Error ? error.message : 'Unknown smoke failure';
  console.error('SMOKE: FAIL:', message);
  process.exitCode = 1;
});
