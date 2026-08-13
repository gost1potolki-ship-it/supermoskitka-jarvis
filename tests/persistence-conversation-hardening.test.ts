import { PersistenceConflictError } from '../src/domain/index.js';
import {
  FirestoreConversationStore,
  InMemoryFirestoreGateway,
} from '../src/infrastructure/firestore/index.js';
import { InMemoryConversationStore } from '../src/storage/index.js';
import { describe, expect, it } from 'vitest';

function seedConversation(conversationId: string) {
  return {
    conversationId,
    channel: 'telegram' as const,
    customerId: 'customer-1',
    mode: 'AI' as const,
    createdAt: '2026-08-13T10:00:00.000Z',
    updatedAt: '2026-08-13T10:00:00.000Z',
  };
}

describe.each([
  {
    name: 'InMemoryConversationStore',
    createStore: () => new InMemoryConversationStore(),
  },
  {
    name: 'FirestoreConversationStore',
    createStore: () => new FirestoreConversationStore(new InMemoryFirestoreGateway()),
  },
])('Conversation revision fail-closed ($name)', ({ createStore }) => {
  it('CONV-REV-1 create → revision 1', async () => {
    const store = createStore();
    const created = await store.createConversation(seedConversation('conv-rev-1'));
    expect(created.revision).toBe(1);
  });

  it('CONV-REV-2 correct revision update → success', async () => {
    const store = createStore();
    const created = await store.createConversation(seedConversation('conv-rev-2'));
    const saved = await store.saveConversation({
      ...created,
      mode: 'HUMAN',
      updatedAt: '2026-08-13T10:05:00.000Z',
    });
    expect(saved.revision).toBe(2);
    expect(saved.mode).toBe('HUMAN');
  });

  it('CONV-REV-3 stale revision → conflict', async () => {
    const store = createStore();
    const created = await store.createConversation(seedConversation('conv-rev-3'));
    await store.saveConversation({
      ...created,
      mode: 'HUMAN',
      updatedAt: '2026-08-13T10:05:00.000Z',
    });
    await expect(
      store.saveConversation({
        ...created,
        mode: 'AI',
        updatedAt: '2026-08-13T10:06:00.000Z',
      }),
    ).rejects.toBeInstanceOf(PersistenceConflictError);
  });

  it('CONV-REV-4 missing revision on existing conversation → conflict', async () => {
    const store = createStore();
    await store.createConversation(seedConversation('conv-rev-4'));
    const { revision: _ignored, ...withoutRevision } = seedConversation('conv-rev-4');
    await expect(store.saveConversation(withoutRevision)).rejects.toBeInstanceOf(
      PersistenceConflictError,
    );
  });
});

describe.each([
  {
    name: 'InMemoryConversationStore',
    createStore: () => new InMemoryConversationStore(),
  },
  {
    name: 'FirestoreConversationStore',
    createStore: () => new FirestoreConversationStore(new InMemoryFirestoreGateway()),
  },
])('Conversation updatedAt on appendMessage ($name)', ({ createStore }) => {
  it('UPDATED-1 append newer message → updatedAt advances', async () => {
    const store = createStore();
    await store.createConversation(seedConversation('upd-1'));
    await store.appendMessage({
      messageId: 'm1',
      conversationId: 'upd-1',
      channel: 'telegram',
      sender: 'CUSTOMER',
      text: 'hello',
      createdAt: '2026-08-13T10:10:00.000Z',
    });
    const loaded = await store.getConversation('upd-1');
    expect(loaded?.updatedAt).toBe('2026-08-13T10:10:00.000Z');
  });

  it('UPDATED-2 append older/out-of-order message → updatedAt does not go backwards', async () => {
    const store = createStore();
    await store.createConversation({
      ...seedConversation('upd-2'),
      updatedAt: '2026-08-13T12:00:00.000Z',
    });
    await store.appendMessage({
      messageId: 'late',
      conversationId: 'upd-2',
      channel: 'telegram',
      sender: 'CUSTOMER',
      text: 'late delivery',
      createdAt: '2026-08-13T11:00:00.000Z',
    });
    const loaded = await store.getConversation('upd-2');
    expect(loaded?.updatedAt).toBe('2026-08-13T12:00:00.000Z');
  });

  it('UPDATED-3 restart/read → updatedAt preserved', async () => {
    const store = createStore();
    await store.createConversation(seedConversation('upd-3'));
    await store.appendMessage({
      messageId: 'm1',
      conversationId: 'upd-3',
      channel: 'telegram',
      sender: 'CUSTOMER',
      text: 'hello',
      createdAt: '2026-08-13T10:30:00.000Z',
    });
    const loaded = await store.getConversation('upd-3');
    expect(loaded?.updatedAt).toBe('2026-08-13T10:30:00.000Z');
  });
});

it('UPDATED-3 Firestore shared gateway survives store restart', async () => {
  const gateway = new InMemoryFirestoreGateway();
  const storeA = new FirestoreConversationStore(gateway);
  await storeA.createConversation({
    conversationId: 'upd-3-fs',
    channel: 'telegram',
    customerId: 'customer-1',
    mode: 'AI',
    createdAt: '2026-08-13T10:00:00.000Z',
    updatedAt: '2026-08-13T10:00:00.000Z',
  });
  await storeA.appendMessage({
    messageId: 'm1',
    conversationId: 'upd-3-fs',
    channel: 'telegram',
    sender: 'CUSTOMER',
    text: 'hello',
    createdAt: '2026-08-13T10:30:00.000Z',
  });
  const storeB = new FirestoreConversationStore(gateway);
  expect((await storeB.getConversation('upd-3-fs'))?.updatedAt).toBe('2026-08-13T10:30:00.000Z');
});
