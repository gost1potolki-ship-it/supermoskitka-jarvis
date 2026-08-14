import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import type { MeasurementSubmissionV1 } from '../../domain/index.js';
import type { UpcomingMeasurementStore } from '../../application/measurement-submission/index.js';
import type { JarvisFirestoreConfig } from '../firestore/index.js';
import {
  assertSafeDocumentId,
  resolveJarvisFirebaseApp,
} from '../firestore/index.js';

import {
  decodeUpcomingMeasurementDocument,
  encodeUpcomingMeasurementDocument,
  type UpcomingMeasurementDocument,
} from './upcoming-measurement-codec.js';

export const UPCOMING_MEASUREMENTS_COLLECTION = 'upcoming_measurements';

function buildCredential(config: JarvisFirestoreConfig) {
  return config.clientEmail && config.privateKey
    ? cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey,
      })
    : applicationDefault();
}

/**
 * Deliberately narrow operational Admin adapter. Every write is hardcoded to
 * upcoming_measurements; it cannot address any other CRM collection.
 */
export class AdminUpcomingMeasurementStore implements UpcomingMeasurementStore {
  private readonly db: Firestore;

  constructor(config: JarvisFirestoreConfig, app?: App) {
    const resolvedApp = resolveJarvisFirebaseApp(
      config,
      getApps(),
      (appName) =>
        initializeApp(
          {
            credential: buildCredential(config),
            projectId: config.projectId,
          },
          appName,
        ),
      app,
    );
    this.db = getFirestore(resolvedApp);
  }

  async upsertPending(submission: MeasurementSubmissionV1, now: string): Promise<void> {
    assertSafeDocumentId(submission.submissionId);
    const ref = this.db.collection(UPCOMING_MEASUREMENTS_COLLECTION).doc(submission.submissionId);
    await this.db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      const previous = (existing.data() ?? {}) as UpcomingMeasurementDocument;
      const createdAt =
        typeof previous.createdAt === 'string' && previous.createdAt
          ? previous.createdAt
          : now;
      const document = encodeUpcomingMeasurementDocument({
        submission,
        createdAt,
        updatedAt: now,
        sheetSyncStatus: 'pending',
        sheetSyncUpdatedAt: now,
      });
      tx.set(ref, document, { merge: true });
    });
  }

  async markSheetSent(submissionId: string, now: string): Promise<void> {
    assertSafeDocumentId(submissionId);
    await this.db.collection(UPCOMING_MEASUREMENTS_COLLECTION).doc(submissionId).update({
      updatedAt: now,
      sheetSyncStatus: 'sent',
      sheetSyncUpdatedAt: now,
      sheetSyncErrorCode: null,
    });
  }

  async markSheetError(submissionId: string, now: string, errorCode: string): Promise<void> {
    assertSafeDocumentId(submissionId);
    await this.db.collection(UPCOMING_MEASUREMENTS_COLLECTION).doc(submissionId).update({
      updatedAt: now,
      sheetSyncStatus: 'error',
      sheetSyncUpdatedAt: now,
      sheetSyncErrorCode: errorCode,
    });
  }

  async get(submissionId: string) {
    assertSafeDocumentId(submissionId);
    const snap = await this.db
      .collection(UPCOMING_MEASUREMENTS_COLLECTION)
      .doc(submissionId)
      .get();
    if (!snap.exists) {
      return null;
    }
    return decodeUpcomingMeasurementDocument(
      (snap.data() ?? {}) as UpcomingMeasurementDocument,
    );
  }
}
