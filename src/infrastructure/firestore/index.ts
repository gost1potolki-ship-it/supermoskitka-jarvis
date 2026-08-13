export {
  JARVIS_CONVERSATIONS_COLLECTION,
  JARVIS_ORDER_MEMORIES_COLLECTION,
  JARVIS_PERSISTENCE_SCHEMA_VERSION,
  MAX_PERSISTED_AGGREGATE_BYTES,
  assertJarvisCollectionName,
  assertSafeDocumentId,
  assertSerializedSize,
} from './constants.js';

export type { JarvisFirestoreConfig } from './firestore-config.js';
export { loadJarvisFirestoreConfig, tryLoadJarvisFirestoreConfig } from './firestore-config.js';

export type {
  FirestorePlainObject,
  JarvisFirestoreGateway,
  JarvisFirestoreTransaction,
} from './firestore-gateway.js';

export { InMemoryFirestoreGateway } from './in-memory-firestore-gateway.js';
export { AdminFirestoreGateway } from './admin-firestore-gateway.js';
export { FirestoreConversationStore } from './firestore-conversation-store.js';
export { FirestoreOrderMemoryStore } from './firestore-order-memory-store.js';

export {
  buildConversationDocument,
  buildOrderMemoryDocument,
  decodeConversationDocument,
  decodeOrderMemoryDocument,
  encodeConversationAggregate,
  encodeOrderMemory,
  decodeOrderMemory,
  decodeConversation,
  decodeMessage,
} from './firestore-codec.js';

export {
  createPersistentJarvisRuntime,
  type PersistentJarvisRuntime,
  type CreatePersistentJarvisRuntimeOptions,
} from './create-persistent-jarvis-runtime.js';
