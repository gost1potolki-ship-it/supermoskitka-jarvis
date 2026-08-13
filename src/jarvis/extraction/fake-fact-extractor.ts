import type {
  FactExtractionRequest,
  FactExtractionResult,
  FactExtractor,
} from './extraction-types.js';

type ScriptedResult =
  | FactExtractionResult
  | ((request: FactExtractionRequest) => FactExtractionResult | Promise<FactExtractionResult>)
  | Error;

/** Deterministic FactExtractor for unit/integration tests. */
export class FakeFactExtractor implements FactExtractor {
  readonly requests: FactExtractionRequest[] = [];
  private step = 0;

  constructor(private readonly script: ScriptedResult[] = []) {}

  async extract(request: FactExtractionRequest): Promise<FactExtractionResult> {
    this.requests.push(structuredClone(request));
    const next = this.script[this.step++] ?? {
      itemProposals: [],
      customerFacts: [],
      fulfillmentFacts: [],
      issues: [],
    };
    if (next instanceof Error) {
      throw next;
    }
    if (typeof next === 'function') {
      return next(request);
    }
    return structuredClone(next);
  }
}

export function emptyExtraction(): FactExtractionResult {
  return {
    itemProposals: [],
    customerFacts: [],
    fulfillmentFacts: [],
    issues: [],
  };
}
