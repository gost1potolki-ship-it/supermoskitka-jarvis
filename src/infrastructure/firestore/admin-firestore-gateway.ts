import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import type { JarvisFirestoreConfig } from './firestore-config.js';
import type {
  FirestorePlainObject,
  JarvisFirestoreGateway,
  JarvisFirestoreTransaction,
} from './firestore-gateway.js';
import { assertJarvisCollectionName, assertSafeDocumentId } from './constants.js';

function toPlain(data: Record<string, unknown>): FirestorePlainObject {
  return JSON.parse(JSON.stringify(data)) as FirestorePlainObject;
}

/**
 * Production Firestore gateway via Firebase Admin SDK.
 * Domain/core never import this module — only infrastructure composition does.
 */
export class AdminFirestoreGateway implements JarvisFirestoreGateway {
  private readonly db: Firestore;

  constructor(config: JarvisFirestoreConfig, app?: App) {
    const existing = getApps()[0];
    const resolvedApp =
      app ??
      existing ??
      initializeApp({
        credential:
          config.clientEmail && config.privateKey
            ? cert({
                projectId: config.projectId,
                clientEmail: config.clientEmail,
                privateKey: config.privateKey,
              })
            : applicationDefault(),
        projectId: config.projectId,
      });
    this.db = getFirestore(resolvedApp);
  }

  async get(collection: string, id: string): Promise<FirestorePlainObject | null> {
    assertJarvisCollectionName(collection);
    assertSafeDocumentId(id);
    const snap = await this.db.collection(collection).doc(id).get();
    if (!snap.exists) {
      return null;
    }
    return toPlain((snap.data() ?? {}) as Record<string, unknown>);
  }

  async delete(collection: string, id: string): Promise<void> {
    assertJarvisCollectionName(collection);
    assertSafeDocumentId(id);
    await this.db.collection(collection).doc(id).delete();
  }

  async runTransaction<T>(fn: (tx: JarvisFirestoreTransaction) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async (firestoreTx) => {
      const tx: JarvisFirestoreTransaction = {
        get: async (collection, id) => {
          assertJarvisCollectionName(collection);
          assertSafeDocumentId(id);
          const snap = await firestoreTx.get(this.db.collection(collection).doc(id));
          if (!snap.exists) {
            return null;
          }
          return toPlain((snap.data() ?? {}) as Record<string, unknown>);
        },
        set: (collection, id, data) => {
          assertJarvisCollectionName(collection);
          assertSafeDocumentId(id);
          firestoreTx.set(this.db.collection(collection).doc(id), data);
        },
        delete: (collection, id) => {
          assertJarvisCollectionName(collection);
          assertSafeDocumentId(id);
          firestoreTx.delete(this.db.collection(collection).doc(id));
        },
      };
      return fn(tx);
    });
  }
}
