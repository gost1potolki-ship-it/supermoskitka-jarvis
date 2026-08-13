/**
 * Live smoke: Jarvis Firestore persistence (jarvis_v1_* only).
 * Requires JARVIS_FIRESTORE_PROJECT_ID (+ ADC or client email/private key).
 */
import { randomUUID } from 'node:crypto';

import { config as loadEnv } from 'dotenv';

import { createFact, getFactValue } from '../src/domain/index.js';
import {
  AdminFirestoreGateway,
  JARVIS_CONVERSATIONS_COLLECTION,
  JARVIS_ORDER_MEMORIES_COLLECTION,
  assertJarvisCollectionName,
  createPersistentJarvisRuntime,
  tryLoadJarvisFirestoreConfig,
} from '../src/infrastructure/firestore/index.js';
import { createOrderMemory, applyOrderItemFact, addOrderItem } from '../src/jarvis/memory/index.js';

loadEnv();

function assertApprovedNamespace(collection: string): void {
  assertJarvisCollectionName(collection);
  if (!collection.startsWith('jarvis_v1')) {
    throw new Error(`STOP: refusing non-jarvis_v1 collection ${collection}`);
  }
}

async function main(): Promise<void> {
  const config = tryLoadJarvisFirestoreConfig();
  if (!config) {
    console.log('SMOKE: NOT RUN — FIRESTORE_CONFIG_MISSING');
    return;
  }

  assertApprovedNamespace(JARVIS_CONVERSATIONS_COLLECTION);
  assertApprovedNamespace(JARVIS_ORDER_MEMORIES_COLLECTION);

  const conversationId = `smoke-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const runtime = createPersistentJarvisRuntime({
    gateway: new AdminFirestoreGateway(config),
    config,
  });
  const { conversationStore, orderMemoryStore, gateway } = runtime;

  console.log(`smoke conversationId: ${conversationId}`);
  console.log(`collections: ${JARVIS_CONVERSATIONS_COLLECTION}, ${JARVIS_ORDER_MEMORIES_COLLECTION}`);

  try {
    const now = new Date().toISOString();
    await conversationStore.createConversation({
      conversationId,
      channel: 'unknown',
      customerId: 'smoke-persistence',
      mode: 'AI',
      createdAt: now,
      updatedAt: now,
    });

    await conversationStore.appendMessage({
      messageId: `${conversationId}-m1`,
      conversationId,
      channel: 'unknown',
      sender: 'CUSTOMER',
      text: 'Test Customer needs FRAME white',
      createdAt: now,
    });

    const source1 = {
      sourceMessageId: `${conversationId}-m1`,
      sourceChannel: 'unknown' as const,
      sourceTimestamp: now,
    };

    let memory = createOrderMemory({
      orderId: conversationId,
      conversationId,
      now,
    });
    memory = addOrderItem(memory, 'item-1', now);
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'productType',
      value: 'FRAME',
      source: source1,
    }).memory;
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'profileColor',
      value: 'WHITE',
      source: source1,
    }).memory;
    memory.customer = {
      name: createFact('Test Customer', source1),
      phone: createFact('+79990000000', source1),
      address: createFact('Test address', source1),
    };

    memory = await orderMemoryStore.save(memory);

    const loaded1 = await orderMemoryStore.get(conversationId);
    if (!loaded1 || getFactValue(loaded1.items[0]?.productType) !== 'FRAME') {
      throw new Error('SMOKE: FAIL — FRAME not restored');
    }
    if (getFactValue(loaded1.items[0]?.profileColor) !== 'WHITE') {
      throw new Error('SMOKE: FAIL — WHITE not restored');
    }

    const later = new Date(Date.parse(now) + 1000).toISOString();
    const source2 = {
      sourceMessageId: `${conversationId}-m2`,
      sourceChannel: 'unknown' as const,
      sourceTimestamp: later,
    };
    memory = applyOrderItemFact(loaded1, {
      orderItemId: 'item-1',
      field: 'profileColor',
      value: 'GRAY_7016',
      source: source2,
    }).memory;
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'ral',
      value: '7016',
      source: source2,
    }).memory;
    memory = await orderMemoryStore.save(memory);

    const loaded2 = await orderMemoryStore.get(conversationId);
    if (getFactValue(loaded2?.items[0]?.profileColor) !== 'GRAY_7016') {
      throw new Error('SMOKE: FAIL — GRAY_7016 not restored');
    }
    if (getFactValue(loaded2?.items[0]?.ral) !== '7016') {
      throw new Error('SMOKE: FAIL — ral 7016 not restored');
    }
    const colorFact = loaded2?.items[0]?.profileColor;
    if (!colorFact?.history.some((entry) => entry.value === 'WHITE')) {
      throw new Error('SMOKE: FAIL — WHITE history missing');
    }
    if (
      !loaded2?.changes.some(
        (change) =>
          change.field === 'profileColor' &&
          change.oldValue === 'WHITE' &&
          change.newValue === 'GRAY_7016',
      )
    ) {
      throw new Error('SMOKE: FAIL — OrderChange WHITE→GRAY_7016 missing');
    }

    const messages = await conversationStore.getMessages(conversationId);
    if (messages.length !== 1 || messages[0]?.sender !== 'CUSTOMER') {
      throw new Error('SMOKE: FAIL — conversation messages not restored');
    }

    console.log('SMOKE: PASS');
  } finally {
    try {
      await gateway.delete(JARVIS_CONVERSATIONS_COLLECTION, conversationId);
      await gateway.delete(JARVIS_ORDER_MEMORIES_COLLECTION, conversationId);
      console.log('smoke cleanup: deleted test documents');
    } catch (cleanupError) {
      console.error('smoke cleanup FAILED — delete manually:', conversationId);
      console.error(cleanupError instanceof Error ? cleanupError.message : cleanupError);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
