import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  CURRENT_PRICE_CATALOG,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
  type PriceCatalogProvider,
} from '../calculation/index.js';
import type { MeasurementActionPolicy } from '../domain/lead-readiness.js';
import { ConversationOrchestrator } from '../jarvis/conversation/index.js';
import { LlmFactExtractor, type FactExtractor } from '../jarvis/extraction/index.js';
import { CalculationTool, ToolRuntime } from '../jarvis/tools/index.js';
import type { SystemPromptProvider } from '../jarvis/system-prompt-provider.js';
import { KnowledgeSystemPromptProvider } from '../knowledge/index.js';
import type { LlmProvider } from '../llm/index.js';
import type { ConversationStore } from '../storage/conversation-store.js';
import type { OrderMemoryStore } from '../storage/order-memory-store.js';

import { JarvisApplication } from './jarvis-application.js';
import type { IdGenerator } from './id-generator.js';

export interface ComposeJarvisApplicationInput {
  conversationStore: ConversationStore;
  orderMemoryStore: OrderMemoryStore;
  llm: LlmProvider;
  systemPromptProvider?: SystemPromptProvider;
  knowledgeRoot?: string;
  priceCatalogProvider?: PriceCatalogProvider;
  factExtractor?: FactExtractor;
  includeFactExtractor?: boolean;
  includeCalculationTools?: boolean;
  measurementActionPolicy?: MeasurementActionPolicy;
  idGenerator?: IdGenerator;
}

export interface ComposedJarvisApplication {
  application: JarvisApplication;
  orchestrator: ConversationOrchestrator;
  conversationStore: ConversationStore;
  orderMemoryStore: OrderMemoryStore;
  toolRuntime?: ToolRuntime;
  factExtractor?: FactExtractor;
}

function defaultKnowledgeRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../knowledge');
}

function defaultPriceCatalogProvider(): PriceCatalogProvider {
  return new StaticPriceCatalogProvider({
    version: 'current-prices-base@66465b1',
    prices: CURRENT_PRICE_CATALOG,
    businessRulesVersion: CURRENT_BUSINESS_RULES_VERSION,
    businessRules: CURRENT_BUSINESS_RULES,
  });
}

/**
 * Shared Jarvis Core wiring used by production, smoke, and tests.
 * Callers supply stores + LLM; this builds one orchestrator/application graph.
 */
export function composeJarvisApplication(
  input: ComposeJarvisApplicationInput,
): ComposedJarvisApplication {
  const includeTools = input.includeCalculationTools !== false;
  const includeExtractor = input.includeFactExtractor !== false;

  const priceCatalogProvider = input.priceCatalogProvider ?? defaultPriceCatalogProvider();
  const toolRuntime = includeTools
    ? new ToolRuntime(new CalculationTool(new SuperMoskitkaCalculationEngine(priceCatalogProvider)))
    : undefined;

  const factExtractor =
    includeExtractor
      ? (input.factExtractor ?? new LlmFactExtractor(input.llm))
      : input.factExtractor;

  const systemPromptProvider =
    input.systemPromptProvider ??
    new KnowledgeSystemPromptProvider(input.knowledgeRoot ?? defaultKnowledgeRoot());

  const orchestrator = new ConversationOrchestrator(
    input.conversationStore,
    input.llm,
    systemPromptProvider,
    {
      orderMemoryStore: input.orderMemoryStore,
      ...(toolRuntime ? { toolRuntime } : {}),
      ...(factExtractor ? { factExtractor } : {}),
    },
  );

  const application = new JarvisApplication({
    conversationStore: input.conversationStore,
    orderMemoryStore: input.orderMemoryStore,
    orchestrator,
    ...(input.measurementActionPolicy
      ? { measurementActionPolicy: input.measurementActionPolicy }
      : {}),
    ...(input.idGenerator ? { idGenerator: input.idGenerator } : {}),
  });

  return {
    application,
    orchestrator,
    conversationStore: input.conversationStore,
    orderMemoryStore: input.orderMemoryStore,
    ...(toolRuntime ? { toolRuntime } : {}),
    ...(factExtractor ? { factExtractor } : {}),
  };
}
