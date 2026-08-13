import type { MeasurementActionPolicy } from '../../src/domain/lead-readiness.js';
import { JarvisApplication } from '../../src/application/index.js';
import { createApp } from '../../src/app/server.js';
import { createLogger } from '../../src/app/logger.js';
import { ConversationOrchestrator } from '../../src/jarvis/conversation/index.js';
import { FakeSystemPromptProvider } from '../../src/jarvis/fake-system-prompt-provider.js';
import {
  FakeFactExtractor,
  emptyExtraction,
  type FactExtractor,
} from '../../src/jarvis/extraction/index.js';
import { FakeLlmProvider } from '../../src/llm/index.js';
import {
  InMemoryConversationStore,
  InMemoryOrderMemoryStore,
} from '../../src/storage/index.js';

export const TEST_INTERNAL_API_KEY = 'test-internal-api-key-task12';

export interface TestJarvisHarness {
  app: ReturnType<typeof createApp>;
  application: JarvisApplication;
  conversationStore: InMemoryConversationStore;
  orderMemoryStore: InMemoryOrderMemoryStore;
  llm: FakeLlmProvider;
  factExtractor: FakeFactExtractor;
  apiKey: string;
}

export function createTestJarvisHarness(options?: {
  apiKey?: string | undefined;
  replyText?: string;
  measurementActionPolicy?: MeasurementActionPolicy;
  factExtractor?: FactExtractor;
  includeFactExtractor?: boolean;
}): TestJarvisHarness {
  const conversationStore = new InMemoryConversationStore();
  const orderMemoryStore = new InMemoryOrderMemoryStore();
  const llm = new FakeLlmProvider(options?.replyText ?? 'Тестовый ответ Jarvis');
  const factExtractor =
    options?.factExtractor instanceof FakeFactExtractor
      ? options.factExtractor
      : new FakeFactExtractor([emptyExtraction()]);
  const orchestrator = new ConversationOrchestrator(
    conversationStore,
    llm,
    new FakeSystemPromptProvider('SYSTEM PROMPT'),
    {
      orderMemoryStore,
      ...(options?.includeFactExtractor === false
        ? {}
        : { factExtractor: options?.factExtractor ?? factExtractor }),
    },
  );
  const application = new JarvisApplication({
    conversationStore,
    orderMemoryStore,
    orchestrator,
    ...(options?.measurementActionPolicy
      ? { measurementActionPolicy: options.measurementActionPolicy }
      : {}),
  });
  const apiKey = options?.apiKey === undefined ? TEST_INTERNAL_API_KEY : options.apiKey;
  const app = createApp(createLogger('error'), {
    application,
    ...(apiKey ? { internalApiKey: apiKey } : {}),
  });

  return {
    app,
    application,
    conversationStore,
    orderMemoryStore,
    llm,
    factExtractor:
      options?.factExtractor instanceof FakeFactExtractor
        ? options.factExtractor
        : factExtractor,
    apiKey: apiKey ?? '',
  };
}
