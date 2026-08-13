/**
 * Live smoke: OdiRouter fact extraction → Order Memory.
 * Requires ODIROUTER_API_KEY + ODIROUTER_MODEL (tool_calling capable).
 */
import { randomUUID } from 'node:crypto';

import { config as loadEnv } from 'dotenv';

import { getFactValue } from '../src/domain/index.js';
import { ConversationOrchestrator } from '../src/jarvis/conversation/index.js';
import { LlmFactExtractor } from '../src/jarvis/extraction/index.js';
import { KnowledgeSystemPromptProvider } from '../src/knowledge/index.js';
import {
  OdiRouterConfigError,
  OdiRouterLlmProvider,
  OdiRouterProviderError,
  loadOdiRouterConfig,
} from '../src/llm/index.js';
import { InMemoryConversationStore, InMemoryOrderMemoryStore } from '../src/storage/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

loadEnv();

const TURN_1 =
  'Нужна одна рамочная сетка, размер готового изделия 1000×1500 мм, Антимошка, цвет белый.';
const TURN_2 = 'Нет, цвет всё-таки серый RAL 7016.';

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

  const knowledgeRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../knowledge',
  );
  const store = new InMemoryConversationStore();
  const memoryStore = new InMemoryOrderMemoryStore();
  const llm = new OdiRouterLlmProvider(config);
  const orchestrator = new ConversationOrchestrator(
    store,
    llm,
    new KnowledgeSystemPromptProvider(knowledgeRoot),
    {
      factExtractor: new LlmFactExtractor(llm),
      orderMemoryStore: memoryStore,
    },
  );

  const conversationId = randomUUID();
  const now = new Date().toISOString();
  await store.createConversation({
    conversationId,
    channel: 'unknown',
    customerId: 'smoke-facts',
    mode: 'AI',
    createdAt: now,
    updatedAt: now,
  });

  console.log('provider: odirouter');
  console.log(`model: ${config.model}`);

  const turn1 = await orchestrator.handleIncomingMessage({
    conversationId,
    messageId: randomUUID(),
    text: TURN_1,
  });
  if (turn1.status !== 'ai_replied') {
    console.error('SMOKE: FAIL — turn 1 expected ai_replied');
    process.exitCode = 1;
    return;
  }

  const memory1 = await memoryStore.get(conversationId);
  const item1 = memory1?.items[0];
  console.log('TURN 1:');
  console.log(`extracted fields: ${turn1.factExtraction?.appliedFields.join(', ') ?? '(none)'}`);
  if ((turn1.factExtraction?.issues.length ?? 0) > 0) {
    console.log(
      `issues: ${turn1.factExtraction?.issues.map((issue) => issue.code).join(', ')}`,
    );
  }
  if ((turn1.factExtraction?.skipped.length ?? 0) > 0) {
    console.log(
      `skipped: ${turn1.factExtraction?.skipped.map((issue) => issue.code).join(', ')}`,
    );
  }
  if (turn1.factExtraction?.failed) {
    console.log(`extraction failed: ${turn1.factExtraction.errorMessage ?? 'unknown'}`);
  }
  console.log(
    `memory: productType=${String(getFactValue(item1?.productType))} quantity=${String(getFactValue(item1?.quantity))} widthMm=${String(getFactValue(item1?.widthMm))} heightMm=${String(getFactValue(item1?.heightMm))} meshType=${String(getFactValue(item1?.meshType))} profileColor=${String(getFactValue(item1?.profileColor))}`,
  );

  const turn1Ok =
    memory1?.items.length === 1 &&
    getFactValue(item1?.productType) === 'FRAME' &&
    getFactValue(item1?.quantity) === 1 &&
    getFactValue(item1?.widthMm) === 1000 &&
    getFactValue(item1?.heightMm) === 1500 &&
    getFactValue(item1?.meshType) === 'ANTIMOSHKA' &&
    getFactValue(item1?.profileColor) === 'WHITE' &&
    item1?.productType?.current.sourceMessageId === turn1.customerMessage.messageId;

  const turn2 = await orchestrator.handleIncomingMessage({
    conversationId,
    messageId: randomUUID(),
    text: TURN_2,
  });
  if (turn2.status !== 'ai_replied') {
    console.error('SMOKE: FAIL — turn 2 expected ai_replied');
    process.exitCode = 1;
    return;
  }

  const memory2 = await memoryStore.get(conversationId);
  const item2 = memory2?.items[0];
  const colorChange = memory2?.changes.find((change) => change.field === 'profileColor');
  console.log('TURN 2:');
  console.log(`extracted fields: ${turn2.factExtraction?.appliedFields.join(', ') ?? '(none)'}`);
  if ((turn2.factExtraction?.issues.length ?? 0) > 0) {
    console.log(
      `issues: ${turn2.factExtraction?.issues.map((issue) => issue.code).join(', ')}`,
    );
  }
  if ((turn2.factExtraction?.skipped.length ?? 0) > 0) {
    console.log(
      `skipped: ${turn2.factExtraction?.skipped.map((issue) => issue.code).join(', ')}`,
    );
  }
  if (turn2.factExtraction?.failed) {
    console.log(`extraction failed: ${turn2.factExtraction.errorMessage ?? 'unknown'}`);
  }
  console.log(
    `memory: profileColor=${String(getFactValue(item2?.profileColor))} ral=${String(getFactValue(item2?.ral))}`,
  );
  console.log(
    `changes: ${colorChange ? `${String(colorChange.oldValue)} → ${String(colorChange.newValue)}` : '(none)'}`,
  );

  const turn2Ok =
    getFactValue(item2?.profileColor) === 'GRAY_7016' &&
    getFactValue(item2?.ral) === '7016' &&
    colorChange?.oldValue === 'WHITE' &&
    colorChange?.newValue === 'GRAY_7016' &&
    item2?.profileColor?.history.some((entry) => entry.value === 'WHITE') === true;

  const leaked = (await store.getMessages(conversationId)).some(
    (message) =>
      message.text.includes('extract_order_facts') || message.text.includes('sourceMessageId'),
  );

  if (turn1Ok && turn2Ok && !leaked) {
    console.log('SMOKE: PASS');
    return;
  }

  console.error('SMOKE: FAIL');
  console.error(`turn1Ok=${turn1Ok}`);
  console.error(`turn2Ok=${turn2Ok}`);
  console.error(`leaked=${leaked}`);
  if (turn1.factExtraction?.failed) {
    console.error(`turn1 extraction error: ${turn1.factExtraction.errorMessage ?? 'unknown'}`);
  }
  if (turn2.factExtraction?.failed) {
    console.error(`turn2 extraction error: ${turn2.factExtraction.errorMessage ?? 'unknown'}`);
  }
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
