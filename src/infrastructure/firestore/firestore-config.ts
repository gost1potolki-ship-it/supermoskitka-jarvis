import { PersistenceConfigError } from '../../domain/errors.js';

export interface JarvisFirestoreConfig {
  projectId: string;
  clientEmail?: string;
  privateKey?: string;
}

export function loadJarvisFirestoreConfig(
  env: NodeJS.ProcessEnv = process.env,
): JarvisFirestoreConfig {
  const projectId = env.JARVIS_FIRESTORE_PROJECT_ID?.trim();
  if (!projectId) {
    throw new PersistenceConfigError(
      'JARVIS_FIRESTORE_PROJECT_ID is required for Firestore persistence',
    );
  }

  const clientEmail = env.JARVIS_FIRESTORE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = env.JARVIS_FIRESTORE_PRIVATE_KEY;
  if (clientEmail || privateKeyRaw) {
    if (!clientEmail || !privateKeyRaw) {
      throw new PersistenceConfigError(
        'Both JARVIS_FIRESTORE_CLIENT_EMAIL and JARVIS_FIRESTORE_PRIVATE_KEY are required when using explicit credentials',
      );
    }
    return {
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
    };
  }

  return { projectId };
}

/** Returns null when Firestore project is not configured (smoke / optional boot). */
export function tryLoadJarvisFirestoreConfig(
  env: NodeJS.ProcessEnv = process.env,
): JarvisFirestoreConfig | null {
  if (!env.JARVIS_FIRESTORE_PROJECT_ID?.trim()) {
    return null;
  }
  return loadJarvisFirestoreConfig(env);
}
