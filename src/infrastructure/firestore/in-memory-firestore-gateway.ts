import type { FirestorePlainObject, JarvisFirestoreGateway, JarvisFirestoreTransaction } from './firestore-gateway.js';

/** Deterministic in-memory Firestore stand-in for unit tests. */
export class InMemoryFirestoreGateway implements JarvisFirestoreGateway {
  private readonly docs = new Map<string, FirestorePlainObject>();

  private key(collection: string, id: string): string {
    return `${collection}/${id}`;
  }

  async get(collection: string, id: string): Promise<FirestorePlainObject | null> {
    const value = this.docs.get(this.key(collection, id));
    return value ? structuredClone(value) : null;
  }

  async delete(collection: string, id: string): Promise<void> {
    this.docs.delete(this.key(collection, id));
  }

  async runTransaction<T>(fn: (tx: JarvisFirestoreTransaction) => Promise<T>): Promise<T> {
    const reads = new Map<string, FirestorePlainObject | null>();
    const writes = new Map<string, FirestorePlainObject | null>();

    const tx: JarvisFirestoreTransaction = {
      get: async (collection, id) => {
        const key = this.key(collection, id);
        if (writes.has(key)) {
          const written = writes.get(key) ?? null;
          return written ? structuredClone(written) : null;
        }
        if (!reads.has(key)) {
          reads.set(key, await this.get(collection, id));
        }
        const value = reads.get(key) ?? null;
        return value ? structuredClone(value) : null;
      },
      set: (collection, id, data) => {
        writes.set(this.key(collection, id), structuredClone(data));
      },
      delete: (collection, id) => {
        writes.set(this.key(collection, id), null);
      },
    };

    const result = await fn(tx);
    for (const [key, value] of writes) {
      if (value === null) {
        this.docs.delete(key);
      } else {
        this.docs.set(key, value);
      }
    }
    return result;
  }
}
