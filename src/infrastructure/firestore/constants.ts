import { PersistenceSizeLimitError } from '../../domain/errors.js';

/** Jarvis-only Firestore namespaces — never write to operational CRM collections. */
export const JARVIS_CONVERSATIONS_COLLECTION = 'jarvis_v1_conversations';
export const JARVIS_ORDER_MEMORIES_COLLECTION = 'jarvis_v1_order_memories';

/** Conservative size guard well below Firestore 1 MiB document limit. */
export const MAX_PERSISTED_AGGREGATE_BYTES = 800_000;

export const JARVIS_PERSISTENCE_SCHEMA_VERSION = 1 as const;

const SAFE_DOC_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export function assertJarvisCollectionName(collection: string): void {
  if (
    collection !== JARVIS_CONVERSATIONS_COLLECTION &&
    collection !== JARVIS_ORDER_MEMORIES_COLLECTION
  ) {
    throw new Error(`Refusing non-Jarvis Firestore collection: ${collection}`);
  }
  if (!collection.startsWith('jarvis_v1')) {
    throw new Error(`Refusing Firestore collection without jarvis_v1 prefix: ${collection}`);
  }
}

export function assertSafeDocumentId(documentId: string): void {
  if (!SAFE_DOC_ID.test(documentId) || documentId.includes('..') || documentId.includes('/')) {
    throw new Error(`Unsafe Firestore document id: ${documentId}`);
  }
}

export function assertSerializedSize(payload: unknown, label: string): void {
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > MAX_PERSISTED_AGGREGATE_BYTES) {
    throw new PersistenceSizeLimitError(
      `${label} serialized size ${bytes} exceeds MAX_PERSISTED_AGGREGATE_BYTES=${MAX_PERSISTED_AGGREGATE_BYTES}`,
    );
  }
}
