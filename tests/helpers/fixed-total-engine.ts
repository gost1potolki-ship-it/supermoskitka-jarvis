import type {
  CalculationEngine,
  CalculationOutcome,
  CalculationRequest,
} from '../../src/calculation/index.js';

/** Test fake: returns a fixed selling total from engine.calculate(). */
export class FixedTotalCalculationEngine implements CalculationEngine {
  lastRequest: CalculationRequest | undefined;

  constructor(private readonly totalRub: number) {}

  async calculate(request: CalculationRequest): Promise<CalculationOutcome> {
    this.lastRequest = request;
    return {
      status: 'calculated',
      items: [],
      total: this.totalRub,
      warnings: [],
      missingFields: [],
      calculationVersion: 'test-fixed-total',
      priceVersion: 'test-fixed-total',
      businessRulesVersion: 'test-fixed-total',
    };
  }
}
