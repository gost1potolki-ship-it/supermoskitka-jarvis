import {
  PersistenceConflictError,
  PersistenceDataError,
  PersistenceSizeLimitError,
} from '../src/domain/index.js';
import {
  JARVIS_CONVERSATIONS_COLLECTION,
  JARVIS_ORDER_MEMORIES_COLLECTION,
  MAX_PERSISTED_AGGREGATE_BYTES,
  FirestoreConversationStore,
  FirestoreOrderMemoryStore,
  InMemoryFirestoreGateway,
  buildOrderMemoryDocument,
} from '../src/infrastructure/firestore/index.js';
import { createOrderMemory } from '../src/jarvis/memory/index.js';
import { describe, expect, it } from 'vitest';

describe('Firestore store adapters (fake gateway)', () => {
  it('STORE-1 deterministic document id', async () => {
    const gateway = new InMemoryFirestoreGateway();
    const store = new FirestoreConversationStore(gateway);
    const conversationId = 'conv-store-1';
    await store.createConversation({
      conversationId,
      channel: 'telegram',
      customerId: 'c1',
      mode: 'AI',
      createdAt: '2026-08-13T10:00:00.000Z',
      updatedAt: '2026-08-13T10:00:00.000Z',
    });
    const raw = await gateway.get(JARVIS_CONVERSATIONS_COLLECTION, conversationId);
    expect(raw).not.toBeNull();
    expect(await gateway.get(JARVIS_CONVERSATIONS_COLLECTION, 'other-id')).toBeNull();
  });

  it('STORE-2 create revision', async () => {
    const gateway = new InMemoryFirestoreGateway();
    const conversations = new FirestoreConversationStore(gateway);
    const memories = new FirestoreOrderMemoryStore(gateway);
    const created = await conversations.createConversation({
      conversationId: 'conv-rev',
      channel: 'website',
      customerId: 'c1',
      mode: 'AI',
      createdAt: '2026-08-13T10:00:00.000Z',
      updatedAt: '2026-08-13T10:00:00.000Z',
    });
    expect(created.revision).toBe(1);
    const memory = await memories.save(
      createOrderMemory({
        orderId: 'conv-rev',
        conversationId: 'conv-rev',
        now: '2026-08-13T10:00:00.000Z',
      }),
    );
    expect(memory.revision).toBe(1);
  });

  it('STORE-3 successful update increments revision', async () => {
    const gateway = new InMemoryFirestoreGateway();
    const store = new FirestoreOrderMemoryStore(gateway);
    let memory = await store.save(
      createOrderMemory({
        orderId: 'conv-inc',
        conversationId: 'conv-inc',
        now: '2026-08-13T10:00:00.000Z',
      }),
    );
    expect(memory.revision).toBe(1);
    memory = await store.save({ ...memory, updatedAt: '2026-08-13T10:01:00.000Z' });
    expect(memory.revision).toBe(2);
  });

  it('STORE-4 stale revision → PERSISTENCE_CONFLICT', async () => {
    const gateway = new InMemoryFirestoreGateway();
    const store = new FirestoreOrderMemoryStore(gateway);
    const saved = await store.save(
      createOrderMemory({
        orderId: 'conv-conflict',
        conversationId: 'conv-conflict',
        now: '2026-08-13T10:00:00.000Z',
      }),
    );
    await store.save({ ...saved, updatedAt: '2026-08-13T10:01:00.000Z' });
    await expect(
      store.save({ ...saved, updatedAt: '2026-08-13T10:02:00.000Z' }),
    ).rejects.toBeInstanceOf(PersistenceConflictError);
  });

  it('STORE-5 size guard', async () => {
    const gateway = new InMemoryFirestoreGateway();
    const store = new FirestoreConversationStore(gateway);
    const conversationId = 'conv-size';
    await store.createConversation({
      conversationId,
      channel: 'telegram',
      customerId: 'c1',
      mode: 'AI',
      createdAt: '2026-08-13T10:00:00.000Z',
      updatedAt: '2026-08-13T10:00:00.000Z',
    });
    const huge = 'x'.repeat(MAX_PERSISTED_AGGREGATE_BYTES);
    await expect(
      store.appendMessage({
        messageId: 'huge',
        conversationId,
        channel: 'telegram',
        sender: 'CUSTOMER',
        text: huge,
        createdAt: '2026-08-13T10:00:01.000Z',
      }),
    ).rejects.toBeInstanceOf(PersistenceSizeLimitError);
  });

  it('STORE-6 missing document → null / undefined', async () => {
    const gateway = new InMemoryFirestoreGateway();
    const conversations = new FirestoreConversationStore(gateway);
    const memories = new FirestoreOrderMemoryStore(gateway);
    expect(await conversations.getConversation('missing')).toBeUndefined();
    expect(await memories.get('missing')).toBeNull();
  });

  it('STORE-7 corrupted document → controlled data error', async () => {
    const gateway = new InMemoryFirestoreGateway();
    const store = new FirestoreOrderMemoryStore(gateway);
    const conversationId = 'conv-corrupt';
    const valid = buildOrderMemoryDocument(
      createOrderMemory({
        orderId: conversationId,
        conversationId,
        now: '2026-08-13T10:00:00.000Z',
      }),
      1,
    );
    await gateway.runTransaction(async (tx) => {
      tx.set(JARVIS_ORDER_MEMORIES_COLLECTION, conversationId, {
        ...valid,
        memory: {
          ...(valid.memory as object),
          items: 'not-an-array',
        },
      });
    });
    await expect(store.get(conversationId)).rejects.toBeInstanceOf(PersistenceDataError);
  });
});
