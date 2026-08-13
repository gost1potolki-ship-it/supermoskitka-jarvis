import type { ConversationStore } from '../../storage/conversation-store.js';
import type { OrderMemoryStore } from '../../storage/order-memory-store.js';

import { AdminFirestoreGateway } from './admin-firestore-gateway.js';
import { loadJarvisFirestoreConfig, type JarvisFirestoreConfig } from './firestore-config.js';
import { FirestoreConversationStore } from './firestore-conversation-store.js';
import type { JarvisFirestoreGateway } from './firestore-gateway.js';
import { FirestoreOrderMemoryStore } from './firestore-order-memory-store.js';

export interface PersistentJarvisRuntime {
  conversationStore: ConversationStore;
  orderMemoryStore: OrderMemoryStore;
  gateway: JarvisFirestoreGateway;
}

export interface CreatePersistentJarvisRuntimeOptions {
  /** Injected gateway (unit tests). When omitted, Admin SDK + env config is used. */
  gateway?: JarvisFirestoreGateway;
  /** Explicit config; defaults to `loadJarvisFirestoreConfig()` (fail-fast). */
  config?: JarvisFirestoreConfig;
}

/**
 * Explicit Firestore-backed store composition.
 * Does not silently fall back to in-memory stores.
 */
export function createPersistentJarvisRuntime(
  options: CreatePersistentJarvisRuntimeOptions = {},
): PersistentJarvisRuntime {
  const gateway =
    options.gateway ??
    new AdminFirestoreGateway(options.config ?? loadJarvisFirestoreConfig());

  return {
    gateway,
    conversationStore: new FirestoreConversationStore(gateway),
    orderMemoryStore: new FirestoreOrderMemoryStore(gateway),
  };
}
