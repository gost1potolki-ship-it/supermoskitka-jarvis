import { PersistenceConfigError } from '../../domain/errors.js';

/** Minimal Firebase Admin app shape for project-boundary checks (no SDK import). */
export interface FirebaseAppLike {
  name: string;
  options: {
    projectId?: string;
  };
}

export function jarvisFirebaseAppName(projectId: string): string {
  return `jarvis-firestore-${projectId}`;
}

export function assertFirebaseAppProjectMatch(
  app: FirebaseAppLike,
  expectedProjectId: string,
): void {
  const actual = app.options.projectId;
  if (actual !== expectedProjectId) {
    throw new PersistenceConfigError(
      `Firebase app projectId mismatch: expected "${expectedProjectId}", got "${actual ?? '(missing)'}"`,
    );
  }
}

/**
 * Resolve which Firebase Admin app Jarvis may use.
 * Never reuses getApps()[0] without verifying projectId and Jarvis app name.
 */
export function resolveJarvisFirebaseApp<T extends FirebaseAppLike>(
  config: { projectId: string },
  existingApps: readonly T[],
  initializeNamedApp: (appName: string) => T,
  injectedApp?: T,
): T {
  if (injectedApp) {
    assertFirebaseAppProjectMatch(injectedApp, config.projectId);
    return injectedApp;
  }

  const name = jarvisFirebaseAppName(config.projectId);
  const named = existingApps.find((app) => app.name === name);
  if (named) {
    assertFirebaseAppProjectMatch(named, config.projectId);
    return named;
  }

  return initializeNamedApp(name);
}
