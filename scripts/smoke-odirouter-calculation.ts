/**
 * Live smoke: OdiRouter tool calling → Calculation Engine → PriceIntegrityGuard.
 * DEV SMOKE PRICE SNAPSHOT — NOT PRODUCTION LIVE PRICE SOURCE.
 *
 * Requires ODIROUTER_API_KEY + ODIROUTER_MODEL (tool_calling capable).
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

import {
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
  type CalculationEngine,
  type CalculationRequest,
} from '../src/calculation/index.js';
import { ConversationOrchestrator } from '../src/jarvis/conversation/index.js';
import { CalculationTool, ToolRuntime } from '../src/jarvis/tools/index.js';
import { KnowledgeSystemPromptProvider } from '../src/knowledge/index.js';
import {
  OdiRouterConfigError,
  OdiRouterLlmProvider,
  OdiRouterProviderError,
  filterTextLlmCatalogModels,
  loadOdiRouterConfig,
  parseOdiRouterCatalogPayload,
  toOdiRouterModelShortlist,
} from '../src/llm/index.js';
import { InMemoryConversationStore } from '../src/storage/index.js';
import { CURRENT_PRICE_CATALOG } from '../tests/fixtures/calculation-prices-current.js';

loadEnv();

/** CURRENT FRAME baseline from tests/calculation-current.test.ts */
const SMOKE_FRAME_REQUEST: CalculationRequest = {
  customerType: 'retail',
  items: [
    {
      itemId: 'item-1',
      productType: 'FRAME',
      widthMm: 1000,
      heightMm: 1500,
      quantity: 1,
      meshType: 'STANDARD',
      color: { kind: 'WHITE' },
      fastening: 'Z_METAL',
      frameProfile: '25',
      cornerType: 'PLASTIC',
      handleType: 'PLASTIC',
    },
  ],
};

const CUSTOMER_PROMPT =
  'Нужна именно одна белая рамочная москитная сетка 1000×1500 мм, крепление металлический Z, профиль 25 мм, пластиковые углы и ручка. Пожалуйста, посчитайте и назовите точную стоимость этой рамочной сетки (только изделие, без замера/доставки/установки).';

class TrackingEngine implements CalculationEngine {
  calls = 0;
  lastOutcome: Awaited<ReturnType<CalculationEngine['calculate']>> | null = null;
  lastRequest: CalculationRequest | null = null;

  constructor(private readonly inner: CalculationEngine) {}

  async calculate(request: CalculationRequest) {
    this.calls += 1;
    this.lastRequest = request;
    this.lastOutcome = await this.inner.calculate(request);
    return this.lastOutcome;
  }
}

function normalizeMoney(text: string): string {
  return text.replace(/[\s\u00a0]/g, '');
}

function containsTotal(text: string, total: number): boolean {
  const normalized = normalizeMoney(text);
  const asNumber = String(total);
  const withSpaces = String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (
    normalized.includes(asNumber) ||
    normalizeMoney(text).includes(normalizeMoney(withSpaces)) ||
    text.includes(String(total))
  );
}

async function assertModelSupportsToolCalling(apiKey: string, baseUrl: string, model: string) {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/models/catalog`);
  url.searchParams.set('page_size', '100');
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to verify model catalog (status ${response.status})`);
  }
  const shortlist = toOdiRouterModelShortlist(
    filterTextLlmCatalogModels(parseOdiRouterCatalogPayload(await response.json())),
  );
  const entry = shortlist.find((item) => item.id === model);
  if (!entry) {
    throw new Error(`Model ${model} not found in OdiRouter catalog`);
  }
  if (!entry.toolCalling) {
    throw new Error(`Model ${model} does not advertise tool_calling — STOP`);
  }
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadOdiRouterConfig();
  } catch (error) {
    if (error instanceof OdiRouterConfigError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  await assertModelSupportsToolCalling(config.apiKey, config.baseUrl, config.model);

  const knowledgeRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../knowledge',
  );

  const innerEngine = new SuperMoskitkaCalculationEngine(
    new StaticPriceCatalogProvider({
      // DEV SMOKE PRICE SNAPSHOT — NOT PRODUCTION LIVE PRICE SOURCE
      version: 'DEV-SMOKE-PRICE-SNAPSHOT@current-prices-base@66465b1',
      prices: CURRENT_PRICE_CATALOG,
      businessRulesVersion: CURRENT_BUSINESS_RULES_VERSION,
      businessRules: CURRENT_BUSINESS_RULES,
    }),
  );
  const expected = await innerEngine.calculate(SMOKE_FRAME_REQUEST);
  if (expected.status !== 'calculated' || expected.total === null) {
    console.error('Expected CURRENT FRAME fixture to calculate before smoke');
    process.exitCode = 1;
    return;
  }

  const engine = new TrackingEngine(innerEngine);
  const store = new InMemoryConversationStore();
  const llm = new OdiRouterLlmProvider(config);
  const orchestrator = new ConversationOrchestrator(
    store,
    llm,
    new KnowledgeSystemPromptProvider(knowledgeRoot),
    { toolRuntime: new ToolRuntime(new CalculationTool(engine)) },
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
    text: CUSTOMER_PROMPT,
  });

  if (result.status !== 'ai_replied') {
    console.error('provider: odirouter');
    console.error(`model: ${config.model}`);
    console.error('SMOKE: FAIL — expected ai_replied');
    process.exitCode = 1;
    return;
  }

  const messages = await store.getMessages(conversationId);
  const senders = messages.map((message) => message.sender);
  const leaked = messages.some(
    (message) =>
      message.text.includes('calculate_order') ||
      message.text.includes('widthMm') ||
      message.text.includes('assemblyLabor') ||
      message.text.includes('businessRulesVersion'),
  );

  const reply = result.replyText;
  const forbidden = /assemblyLabor|margin|profit|businessRulesVersion|себестоим/i.test(reply);
  const totalOk = containsTotal(reply, expected.total);
  const engineCalled = engine.calls >= 1;
  const calculated = engine.lastOutcome?.status === 'calculated';
  const integrity = result.priceIntegrity;
  const mode = integrity?.mode ?? '(unknown)';
  const guardLabel = integrity
    ? integrity.accepted
      ? 'accepted'
      : `fallback (${integrity.reason})`
    : '(no calculation / guard skipped)';

  console.log('provider: odirouter');
  console.log(`model: ${config.model}`);
  console.log('tool name: calculate_order');
  console.log(`mode: ${mode}`);
  console.log(`calculation status: ${engine.lastOutcome?.status ?? 'not_called'}`);
  console.log(`authoritative total: ${integrity?.authoritativeTotal ?? expected.total}`);
  if (integrity?.candidateText) {
    console.log('candidate model response:');
    console.log(integrity.candidateText);
  }
  console.log(`guard: ${guardLabel}`);
  console.log('final response:');
  console.log(reply);

  if (
    engineCalled &&
    calculated &&
    totalOk &&
    !forbidden &&
    !leaked &&
    senders.join(',') === 'CUSTOMER,AI' &&
    reply.trim() !== '' &&
    integrity !== undefined &&
    integrity.authoritativeTotal === expected.total
  ) {
    console.log('SMOKE: PASS');
    console.log('NOTE: DEV SMOKE PRICE SNAPSHOT — NOT PRODUCTION LIVE PRICE SOURCE');
    return;
  }

  console.error('SMOKE: FAIL');
  console.error(`engineCalled=${engineCalled}`);
  console.error(`calculated=${calculated}`);
  console.error(`totalPresent=${totalOk}`);
  console.error(`internalLeak=${forbidden || leaked}`);
  console.error(`persistedSenders=${senders.join(',')}`);
  console.error(`guardPresent=${integrity !== undefined}`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  if (error instanceof OdiRouterProviderError) {
    console.error('provider: odirouter');
    console.error(`model: ${error.model ?? 'unknown'}`);
    if (error.status !== undefined) {
      console.error(`status: ${error.status}`);
    }
    console.error(`message: ${error.message}`);
    console.error('SMOKE: FAIL');
    process.exitCode = 1;
    return;
  }
  const message = error instanceof Error ? error.message : 'Unknown smoke failure';
  console.error('SMOKE: FAIL:', message);
  process.exitCode = 1;
});
