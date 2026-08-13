export type FirestorePlainObject = Record<string, unknown>;

export interface JarvisFirestoreTransaction {
  get(collection: string, id: string): Promise<FirestorePlainObject | null>;
  set(collection: string, id: string, data: FirestorePlainObject): void;
  delete(collection: string, id: string): void;
}

/**
 * Minimal Firestore gateway so unit tests can use an in-memory fake
 * without importing firebase-admin into domain/core.
 */
export interface JarvisFirestoreGateway {
  runTransaction<T>(fn: (tx: JarvisFirestoreTransaction) => Promise<T>): Promise<T>;
  get(collection: string, id: string): Promise<FirestorePlainObject | null>;
  delete(collection: string, id: string): Promise<void>;
}
