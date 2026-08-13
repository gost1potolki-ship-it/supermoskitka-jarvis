import { PersistenceConflictError } from '../src/domain/index.js';
import {
  FirestoreOrderMemoryStore,
  InMemoryFirestoreGateway,
} from '../src/infrastructure/firestore/index.js';
import { createOrderMemory } from '../src/jarvis/memory/index.js';
import { InMemoryOrderMemoryStore } from '../src/storage/index.js';
import { describe, expect, it } from 'vitest';

function blankMemory(conversationId: string) {
  return createOrderMemory({
    orderId: conversationId,
    conversationId,
    now: '2026-08-13T10:00:00.000Z',
  });
}

describe.each([
  {
    name: 'InMemoryOrderMemoryStore',
    createStore: () => new InMemoryOrderMemoryStore(),
  },
  {
    name: 'FirestoreOrderMemoryStore',
    createStore: () => new FirestoreOrderMemoryStore(new InMemoryFirestoreGateway()),
  },
])('OrderMemory revision fail-closed ($name)', ({ createStore }) => {
  it('REVISION-1 new memory without revision → create revision 1', async () => {
    const store = createStore();
    const saved = await store.save(blankMemory('rev-1'));
    expect(saved.revision).toBe(1);
    expect((await store.get('rev-1'))?.revision).toBe(1);
  });

  it('REVISION-2 existing memory + missing revision → conflict', async () => {
    const store = createStore();
    await store.save(blankMemory('rev-2'));
    await expect(store.save(blankMemory('rev-2'))).rejects.toBeInstanceOf(PersistenceConflictError);
  });

  it('REVISION-3 existing memory + correct revision → update', async () => {
    const store = createStore();
    const first = await store.save(blankMemory('rev-3'));
    const second = await store.save({
      ...first,
      updatedAt: '2026-08-13T10:01:00.000Z',
    });
    expect(second.revision).toBe(2);
  });

  it('REVISION-4 existing memory + stale revision → conflict', async () => {
    const store = createStore();
    const first = await store.save(blankMemory('rev-4'));
    await store.save({ ...first, updatedAt: '2026-08-13T10:01:00.000Z' });
    await expect(
      store.save({ ...first, updatedAt: '2026-08-13T10:02:00.000Z' }),
    ).rejects.toBeInstanceOf(PersistenceConflictError);
  });

  it('REVISION-5 simulated create race: second revisionless save conflicts', async () => {
    const store = createStore();
    const snapshotA = blankMemory('rev-race');
    const snapshotB = blankMemory('rev-race');
    const first = await store.save(snapshotA);
    expect(first.revision).toBe(1);
    await expect(store.save(snapshotB)).rejects.toBeInstanceOf(PersistenceConflictError);
    expect((await store.get('rev-race'))?.revision).toBe(1);
  });
});
