import type { Logger } from '../app/logger.js';
import {
  createPersistentJarvisRuntime,
  tryLoadJarvisFirestoreConfig,
  type JarvisFirestoreConfig,
  type JarvisFirestoreGateway,
} from '../infrastructure/firestore/index.js';
import {
  AdminUpcomingMeasurementStore,
  HttpMeasurementSheetGateway,
} from '../infrastructure/measurement-submission/index.js';
import {
  loadOdiRouterConfig,
  OdiRouterConfigError,
  OdiRouterLlmProvider,
  type LlmProvider,
} from '../llm/index.js';
import type { ConversationStore } from '../storage/conversation-store.js';
import type { OrderMemoryStore } from '../storage/order-memory-store.js';

import type {
  MeasurementSheetGateway,
  UpcomingMeasurementStore,
} from './measurement-submission/index.js';
import {
  composeJarvisApplication,
  type ComposedJarvisApplication,
} from './compose-jarvis-application.js';
import type { JarvisApplication } from './jarvis-application.js';

export interface TryCreateProductionJarvisApplicationOptions {
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  /** Test injection: skip Firestore env when stores are provided. */
  conversationStore?: ConversationStore;
  orderMemoryStore?: OrderMemoryStore;
  llm?: LlmProvider;
  gateway?: JarvisFirestoreGateway;
  upcomingMeasurementStore?: UpcomingMeasurementStore;
  measurementSheetGateway?: MeasurementSheetGateway;
  knowledgeRoot?: string;
}

function warn(logger: Logger | undefined, message: string, context?: Record<string, unknown>): void {
  logger?.warn(message, context);
}

/**
 * Production JarvisApplication composition.
 * Requires internal API key presence to be checked by caller/createApp.
 * Uses Firestore stores + OdiRouter — no silent InMemory fallback.
 */
export function tryCreateProductionJarvisApplication(
  options: TryCreateProductionJarvisApplicationOptions = {},
): JarvisApplication | undefined {
  const env = options.env ?? process.env;
  const logger = options.logger;

  let conversationStore = options.conversationStore;
  let orderMemoryStore = options.orderMemoryStore;
  let firestoreConfig: JarvisFirestoreConfig | undefined;

  if (!conversationStore || !orderMemoryStore) {
    try {
      firestoreConfig =
        options.gateway !== undefined
          ? undefined
          : (tryLoadJarvisFirestoreConfig(env) ?? undefined);
      if (!options.gateway && !firestoreConfig) {
        warn(logger, 'internal_api.runtime_incomplete', {
          reason: 'firestore_config_missing',
        });
        return undefined;
      }
      const runtime = createPersistentJarvisRuntime({
        ...(options.gateway ? { gateway: options.gateway } : {}),
        ...(firestoreConfig ? { config: firestoreConfig } : {}),
      });
      conversationStore = runtime.conversationStore;
      orderMemoryStore = runtime.orderMemoryStore;
    } catch (error) {
      warn(logger, 'internal_api.runtime_incomplete', {
        reason: 'firestore_runtime_failed',
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: 'firestore_runtime_failed' },
      });
      return undefined;
    }
  }

  let upcomingMeasurementStore = options.upcomingMeasurementStore;
  if (!upcomingMeasurementStore && firestoreConfig) {
    try {
      upcomingMeasurementStore = new AdminUpcomingMeasurementStore(firestoreConfig);
    } catch (error) {
      warn(logger, 'measurement_submission.store_unavailable', {
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: 'measurement_store_runtime_failed' },
      });
    }
  }
  const measurementSheetGateway =
    options.measurementSheetGateway ??
    new HttpMeasurementSheetGateway(
      env.MEASUREMENT_SHEET_WEBHOOK_URL?.trim() || undefined,
    );

  let llm = options.llm;
  if (!llm) {
    try {
      llm = new OdiRouterLlmProvider(loadOdiRouterConfig(env));
    } catch (error) {
      if (error instanceof OdiRouterConfigError) {
        warn(logger, 'internal_api.runtime_incomplete', {
          reason: 'odirouter_config_missing',
        });
        return undefined;
      }
      warn(logger, 'internal_api.runtime_incomplete', {
        reason: 'odirouter_runtime_failed',
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: 'odirouter_runtime_failed' },
      });
      return undefined;
    }
  }

  const composed: ComposedJarvisApplication = composeJarvisApplication({
    conversationStore,
    orderMemoryStore,
    llm,
    ...(upcomingMeasurementStore ? { upcomingMeasurementStore } : {}),
    measurementSheetGateway,
    ...(logger ? { measurementSubmissionLogger: logger } : {}),
    ...(options.knowledgeRoot ? { knowledgeRoot: options.knowledgeRoot } : {}),
  });

  return composed.application;
}
