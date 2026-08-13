import type {
  CalculationEngine,
  CalculationOutcome,
  CalculationRequest,
} from '../../src/calculation/index.js';

/** Test fake: returns a fixed selling total from engine.calculate(). */
export class FixedTotalCalculationEngine implements CalculationEngine {
  constructor(private readonly totalRub: number) {}

  async calculate(_request: CalculationRequest): Promise<CalculationOutcome> {
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
