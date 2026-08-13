import { PersistenceConfigError } from '../src/domain/index.js';
import {
  assertFirebaseAppProjectMatch,
  jarvisFirebaseAppName,
  resolveJarvisFirebaseApp,
  type FirebaseAppLike,
} from '../src/infrastructure/firestore/index.js';
import { describe, expect, it } from 'vitest';

function app(name: string, projectId: string): FirebaseAppLike {
  return { name, options: { projectId } };
}

describe('Firebase Admin app project boundary', () => {
  it('FIREBASE-APP-1 matching project app can be reused', () => {
    const projectId = 'jarvis-project-a';
    const named = app(jarvisFirebaseAppName(projectId), projectId);
    const initialized: string[] = [];
    const resolved = resolveJarvisFirebaseApp(
      { projectId },
      [app('[DEFAULT]', 'other-project'), named],
      (appName) => {
        initialized.push(appName);
        return app(appName, projectId);
      },
    );
    expect(resolved).toBe(named);
    expect(initialized).toEqual([]);
  });

  it('FIREBASE-APP-2 unrelated pre-existing app is not reused', () => {
    const projectId = 'jarvis-project-a';
    const unrelated = app('[DEFAULT]', 'crm-project-b');
    const initialized: FirebaseAppLike[] = [];
    const resolved = resolveJarvisFirebaseApp({ projectId }, [unrelated], (appName) => {
      const created = app(appName, projectId);
      initialized.push(created);
      return created;
    });
    expect(resolved.name).toBe(jarvisFirebaseAppName(projectId));
    expect(resolved.options.projectId).toBe(projectId);
    expect(resolved).not.toBe(unrelated);
    expect(initialized).toHaveLength(1);
  });

  it('FIREBASE-APP-3 explicit app with wrong project → controlled error', () => {
    const wrong = app('injected', 'crm-project-b');
    expect(() =>
      resolveJarvisFirebaseApp(
        { projectId: 'jarvis-project-a' },
        [],
        (appName) => app(appName, 'jarvis-project-a'),
        wrong,
      ),
    ).toThrow(PersistenceConfigError);

    expect(() => assertFirebaseAppProjectMatch(wrong, 'jarvis-project-a')).toThrow(
      PersistenceConfigError,
    );
  });
});
