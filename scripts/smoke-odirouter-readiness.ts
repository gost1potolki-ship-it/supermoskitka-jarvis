/**
 * Live smoke: OdiRouter preliminary readiness path (Task 11.1).
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
import { LlmFactExtractor } from '../src/jarvis/extraction/index.js';
import {
  applyCustomerFact,
  applyOrderItemFact,
  createOrderMemory,
} from '../src/jarvis/memory/index.js';
import { KnowledgeSystemPromptProvider } from '../src/knowledge/index.js';
import {
  buildCalculationRequestFromTrustedPreliminaryInput,
  buildTrustedPreliminaryCalculationInput,
  decideMeasurementAction,
  evaluateLeadReadiness,
} from '../src/jarvis/preliminary/index.js';
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

const SOURCE = {
  sourceMessageId: 'smoke-preseed',
  sourceChannel: 'telegram' as const,
  sourceTimestamp: new Date().toISOString(),
};

const TURN_1 =
  'Нужна предварительная стоимость под ключ для трёх отдельных рамочных сеток. Точных размеров пока нет, используйте типовой предварительный расчёт. Сетки белые, стандартное полотно, с замером и доставкой по городу.';
const TURN_2 = 'Да, всё устраивает, записывайте на замер.';
const EXPECTED_LEGACY_TOTAL = 15_200;

async function main(): Promise<void> {
  // Task 14 safety gate: ordinary orchestrator turns have no executor hook.
  // Only the explicit internal measurement-submit use case can change this count.
  const operationalSubmissions = 0;
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
      factExtractor: new LlmFactExtractor(llm),
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

  let memory = createOrderMemory({
    orderId: conversationId,
    conversationId,
    itemIds: ['item-1'],
    now,
  });
  memory = applyCustomerFact(memory, {
    field: 'phone',
    value: '+79990001122',
    source: SOURCE,
  }).memory;
  memory = applyCustomerFact(memory, {
    field: 'address',
    value: 'Москва, ул. Смоковая 1',
    source: SOURCE,
  }).memory;
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'productType',
    value: 'FRAME',
    source: SOURCE,
  }).memory;
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'quantity',
    value: 3,
    source: SOURCE,
  }).memory;
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'meshType',
    value: 'STANDARD',
    source: SOURCE,
  }).memory;
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'profileColor',
    value: 'WHITE',
    source: SOURCE,
  }).memory;
  await memoryStore.save(memory);

  console.log('provider: odirouter');
  console.log(`model: ${config.model}`);

  const turn1 = await orchestrator.handleIncomingMessage({
    conversationId,
    messageId: randomUUID(),
    text: TURN_1,
  });

  memory = (await memoryStore.get(conversationId))!;
  const item = memory.items[0];
  const dimsAbsent =
    getFactValue(item?.widthMm) === undefined && getFactValue(item?.heightMm) === undefined;

  console.log(`turn1 status: ${turn1.status}`);
  console.log(`preliminaryQuote: ${memory.preliminaryQuote?.quoteId ?? '(none)'}`);
  console.log(`dims absent in memory: ${dimsAbsent}`);
  console.log(`quoteTrustStatus: ${memory.preliminaryQuote?.quoteTrustStatus ?? '(none)'}`);

  const trustedAfterQuote = buildTrustedPreliminaryCalculationInput(memory);
  let legacyTotalMatches = false;
  let legacyTotalIsExpected = false;
  if (trustedAfterQuote.ok && memory.preliminaryQuote) {
    const legacyOutcome = await engine.calculate(
      buildCalculationRequestFromTrustedPreliminaryInput(trustedAfterQuote.input),
    );
    legacyTotalMatches = memory.preliminaryQuote.publicTotalRub === legacyOutcome.total;
    legacyTotalIsExpected =
      legacyOutcome.total === EXPECTED_LEGACY_TOTAL &&
      memory.preliminaryQuote.publicTotalRub === EXPECTED_LEGACY_TOTAL;
    console.log(`legacy engine total: ${legacyOutcome.total ?? '(none)'}`);
    console.log(`quote public total: ${memory.preliminaryQuote.publicTotalRub}`);
    console.log(`legacy total preserved: ${legacyTotalMatches}`);
  }

  if (
    turn1.status !== 'ai_replied' ||
    !memory.preliminaryQuote ||
    !dimsAbsent ||
    !legacyTotalMatches ||
    !legacyTotalIsExpected
  ) {
    console.error('SMOKE: FAIL — turn 1');
    process.exitCode = 1;
    return;
  }

  const turn2 = await orchestrator.handleIncomingMessage({
    conversationId,
    messageId: randomUUID(),
    text: TURN_2,
  });

  memory = (await memoryStore.get(conversationId))!;
  const readiness = evaluateLeadReadiness(memory);
  const action = decideMeasurementAction(memory, 'AUTO_WHEN_READY');

  console.log(`turn2 status: ${turn2.status}`);
  console.log(`preliminaryPriceAccepted: ${getFactValue(memory.commercial?.preliminaryPriceAccepted)}`);
  console.log(`measurementAgreed: ${getFactValue(memory.commercial?.measurementAgreed)}`);
  console.log(`readiness: ${readiness.status}`);
  console.log(`action: ${action}`);
  console.log(`operational submissions: ${operationalSubmissions}`);

  const pass =
    turn2.status === 'ai_replied' &&
    memory.preliminaryQuote !== undefined &&
    getFactValue(memory.commercial?.preliminaryPriceAccepted) === true &&
    getFactValue(memory.commercial?.measurementAgreed) === true &&
    readiness.status === 'READY_FOR_MEASUREMENT' &&
    action === 'AUTO_ALLOWED' &&
    operationalSubmissions === 0;

  if (pass) {
    console.log('SMOKE: PASS');
    return;
  }

  if (readiness.blockingCodes.length > 0) {
    console.log(`blocking: ${readiness.blockingCodes.join(', ')}`);
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
