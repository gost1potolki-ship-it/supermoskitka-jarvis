export type {
  KnowledgeRule,
  KnowledgeRuleCategory,
  KnowledgeRuleStatus,
  KnowledgeRuleVersion,
  KnowledgeSource,
  KnowledgeSourceType,
} from './types.js';
export { getActiveRuleVersion } from './types.js';

export type { LearningSuggestion, LearningSuggestionStatus, ProposedKnowledgeRule } from './learning-types.js';

export type { RegressionCase, RegressionCaseMessage } from './regression-types.js';

export {
  KnowledgeBase,
  defaultKnowledgeRoot,
  loadKnowledgeBase,
} from './knowledge-loader.js';

export { buildKnowledgeContext } from './knowledge-context-builder.js';

export { KnowledgeSystemPromptProvider } from './knowledge-system-prompt-provider.js';

export {
  KnowledgeValidationError,
  buildKnowledgeRules,
  parseKnowledgeRule,
} from './knowledge-validation.js';

export {
  LearningService,
  LearningServiceError,
  type ApproveSuggestionInput,
  type ApproveSuggestionResult,
  type CreateSuggestionInput,
  type RejectSuggestionInput,
} from './learning-service.js';

export {
  buildRegressionCases,
  loadRegressionCases,
  parseRegressionCase,
} from './regression-loader.js';
