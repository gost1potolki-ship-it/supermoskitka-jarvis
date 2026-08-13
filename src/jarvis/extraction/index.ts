export type {
  ExtractedFieldProposal,
  ExtractedItemProposal,
  ExtractionIssue,
  FactExtractionContextMessage,
  FactExtractionRequest,
  FactExtractionResult,
  FactExplicitness,
  FactExtractor,
  ItemProposalOperation,
} from './extraction-types.js';
export { FactExtractionConfigError } from './extraction-types.js';
export {
  EXTRACT_ORDER_FACTS_PARAMETERS_SCHEMA,
  EXTRACT_ORDER_FACTS_TOOL_NAME,
  createExtractOrderFactsToolDefinition,
} from './extract-order-facts-schema.js';
export { evidenceMatchesMessage, normalizeEvidenceText } from './evidence.js';
export {
  canonicalizeColorFinish,
  canonicalizeMeshType,
  canonicalizeProductType,
  canonicalizeProfileColor,
  canonicalizeRal,
  normalizePhone,
} from './canonicalize.js';
export { parseExtractOrderFactsArguments } from './parse-extraction-result.js';
export {
  applyValidatedExtraction,
  type MemoryApplyDiagnostics,
  type MemoryApplyResult,
} from './memory-apply-service.js';
export { buildOrderMemoryContext } from './memory-context.js';
export { LlmFactExtractor } from './llm-fact-extractor.js';
export { FakeFactExtractor, emptyExtraction } from './fake-fact-extractor.js';
