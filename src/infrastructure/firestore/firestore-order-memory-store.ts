import {
  PersistenceConflictError,
  type OrderMemory,
} from '../../domain/index.js';
import type { OrderMemoryStore } from '../../storage/order-memory-store.js';

import {
  JARVIS_ORDER_MEMORIES_COLLECTION,
  assertJarvisCollectionName,
  assertSafeDocumentId,
  assertSerializedSize,
} from './constants.js';
import { buildOrderMemoryDocument, decodeOrderMemoryDocument } from './firestore-codec.js';
import type { JarvisFirestoreGateway } from './firestore-gateway.js';

assertJarvisCollectionName(JARVIS_ORDER_MEMORIES_COLLECTION);

export class FirestoreOrderMemoryStore implements OrderMemoryStore {
  constructor(private readonly gateway: JarvisFirestoreGateway) {}

  async get(conversationId: string): Promise<OrderMemory | null> {
    assertSafeDocumentId(conversationId);
    const raw = await this.gateway.get(JARVIS_ORDER_MEMORIES_COLLECTION, conversationId);
    if (!raw) {
      return null;
    }
    return decodeOrderMemoryDocument(raw).memory;
  }

  async save(memory: OrderMemory): Promise<OrderMemory> {
    assertSafeDocumentId(memory.conversationId);
    return this.gateway.runTransaction(async (tx) => {
      const existing = await tx.get(JARVIS_ORDER_MEMORIES_COLLECTION, memory.conversationId);
      const expected = memory.revision;

      if (!existing) {
        if (expected !== undefined && expected !== 0) {
          throw new PersistenceConflictError(
            `OrderMemory revision conflict for ${memory.conversationId}`,
          );
        }
        const revision = 1;
        const { revision: _ignored, ...withoutRevision } = memory;
        const doc = buildOrderMemoryDocument(withoutRevision, revision);
        assertSerializedSize(doc, 'orderMemory');
        tx.set(JARVIS_ORDER_MEMORIES_COLLECTION, memory.conversationId, doc);
        return { ...withoutRevision, revision };
      }

      const decoded = decodeOrderMemoryDocument(existing);
      if (expected !== undefined && expected !== decoded.revision) {
        throw new PersistenceConflictError(
          `OrderMemory revision conflict for ${memory.conversationId}`,
        );
      }
      const revision = decoded.revision + 1;
      const { revision: _ignored, ...withoutRevision } = memory;
      const doc = buildOrderMemoryDocument(withoutRevision, revision);
      assertSerializedSize(doc, 'orderMemory');
      tx.set(JARVIS_ORDER_MEMORIES_COLLECTION, memory.conversationId, doc);
      return { ...withoutRevision, revision };
    });
  }
}
