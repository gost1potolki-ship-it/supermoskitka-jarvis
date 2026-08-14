import type { MeasurementPayerType } from './measurement-submission.js';

export const DEFAULT_MEASURER_PAYOUT_RUB = 1000;
export const DEFAULT_MEASURER_PAYER: MeasurementPayerType = 'CUSTOMER';

export interface MeasurementFinancialInput {
  preliminaryTotalRub: number;
  measurerPayer: MeasurementPayerType;
  measurerPayoutRub?: number;
}

export interface MeasurementFinancialProjection {
  preliminaryTotalRub: number;
  measurerPayoutRub: number;
  measurerPayer: MeasurementPayerType;
  customerDepositRub: number;
  remainingBalanceRub: number;
  payerText: string;
}

export function formatMeasurerPayerText(payer: MeasurementPayerType): string {
  return payer === 'COMPANY' ? 'фирма' : 'Заказчик';
}

export function parseMeasurerPayerText(value: unknown): MeasurementPayerType | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes('фирм') || normalized.includes('офис')) return 'COMPANY';
  if (
    normalized.includes('заказчик') ||
    normalized.includes('клиент') ||
    normalized.includes('customer')
  ) {
    return 'CUSTOMER';
  }
  return undefined;
}

export function buildMeasurementFinancials(
  input: MeasurementFinancialInput,
): MeasurementFinancialProjection {
  const preliminaryTotalRub = input.preliminaryTotalRub;
  const measurerPayoutRub = input.measurerPayoutRub ?? DEFAULT_MEASURER_PAYOUT_RUB;
  const measurerPayer = input.measurerPayer;

  if (!Number.isFinite(preliminaryTotalRub) || preliminaryTotalRub < 0) {
    throw new TypeError('preliminaryTotalRub must be a non-negative finite number');
  }
  if (!Number.isFinite(measurerPayoutRub) || measurerPayoutRub < 0) {
    throw new TypeError('measurerPayoutRub must be a non-negative finite number');
  }

  const customerDepositRub = measurerPayer === 'CUSTOMER' ? measurerPayoutRub : 0;
  const remainingBalanceRub = preliminaryTotalRub - customerDepositRub;

  if (customerDepositRub > preliminaryTotalRub) {
    throw new TypeError('customerDepositRub exceeds preliminaryTotalRub');
  }
  if (remainingBalanceRub < 0) {
    throw new TypeError('remainingBalanceRub must be non-negative');
  }

  return {
    preliminaryTotalRub,
    measurerPayoutRub,
    measurerPayer,
    customerDepositRub,
    remainingBalanceRub,
    payerText: formatMeasurerPayerText(measurerPayer),
  };
}

export function assertMeasurementFinancialPayload(payload: {
  preliminaryTotalRub: number;
  measurerPayoutRub: number;
  measurerPayer: MeasurementPayerType;
  customerDepositRub: number;
  remainingBalanceRub: number;
}): MeasurementFinancialProjection {
  const expected = buildMeasurementFinancials(payload);
  if (
    payload.customerDepositRub !== expected.customerDepositRub ||
    payload.remainingBalanceRub !== expected.remainingBalanceRub
  ) {
    throw new TypeError('Measurement financial projection is inconsistent');
  }
  return expected;
}
