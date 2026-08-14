import { calculateManagerWorkTotal, calculateOrderTotals } from '@calc/logic/orderTotals';
import { PRICES as DEFAULT_PRICES } from '@calc/constants';
import type { ArchivedOrder, OrderWorkStatus } from '@calc/types';
import type { ArchiveOrderView } from './archive';

export function getGoogleSheetWebhookUrl(): string {
  const url = String(import.meta.env.VITE_GOOGLE_SHEET_WEBHOOK_URL ?? '').trim();
  if (!url) {
    throw new Error(
      'VITE_GOOGLE_SHEET_WEBHOOK_URL is not configured. Set it in apps/presales-crm/.env.local for local send-to-work.',
    );
  }
  return url;
}

type WebhookSheetRowRef = {
  sheet?: string;
  row?: number;
  orderId?: string;
  status?: string;
};

type WebhookSheetResult = {
  orderId?: string;
  rowsCreated?: number;
  rows?: WebhookSheetRowRef[];
  duplicate?: boolean;
  existingRows?: WebhookSheetRowRef[];
};

export type WebhookSheetResponse = {
  ok?: boolean;
  success?: boolean;
  duplicate?: boolean;
  orderId?: string;
  error?: string;
  message?: string;
  details?: string;
  result?: WebhookSheetResult;
};

const isWebhookSheetSuccess = (parsed: WebhookSheetResponse): boolean => {
  const result = parsed.result;
  const rowsCreated = Number(result?.rowsCreated ?? 0);
  if (rowsCreated > 0) return true;
  if (parsed.duplicate === true) return true;
  if (result?.duplicate === true) return true;
  if (Array.isArray(result?.existingRows) && result.existingRows.length > 0) return true;
  return false;
};

export async function postOrderToGoogleSheet(payload: Record<string, unknown>): Promise<WebhookSheetResponse> {
  const response = await fetch(getGoogleSheetWebhookUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const responseText = await response.text();

  let parsed: WebhookSheetResponse | null = null;
  try {
    parsed = JSON.parse(responseText) as WebhookSheetResponse;
  } catch {
    /* non-json */
  }

  if (!response.ok) {
    const detail = parsed?.error || responseText.slice(0, 300) || `HTTP ${response.status}`;
    throw new Error(`Webhook HTTP ${response.status}: ${detail}`);
  }

  if (parsed && (parsed.ok === false || parsed.success === false)) {
    const errorDetails = parsed.error || parsed.message || parsed.details || JSON.stringify(parsed);
    throw new Error(`Google Apps Script вернул ошибку: ${errorDetails}`);
  }

  if (!parsed) {
    throw new Error(`Webhook вернул не JSON: ${responseText.slice(0, 300)}`);
  }

  if (!isWebhookSheetSuccess(parsed)) {
    throw new Error(
      `Google Таблица не создала строку заказа и не подтвердила дубль по archiveId. Ответ webhook: ${JSON.stringify(parsed)}`
    );
  }

  return parsed;
}

const resolveBaseMeasurementFee = (prices: typeof DEFAULT_PRICES): number =>
  Math.max(
    DEFAULT_PRICES.price_settings.logistics.measurement_fee ?? 1000,
    prices.price_settings.logistics.measurement_fee ?? 0
  );

export const buildSendToWorkPayload = (
  order: ArchivedOrder,
  prices: typeof DEFAULT_PRICES,
  isMeasurementPaidCash = false
): Record<string, unknown> => {
  const items = Array.isArray(order.items) ? order.items : [];
  const hasMeasurementFee = order.includeMeasurementFee === true;
  let totals;
  let managerTotal: number;
  let measurementDeduction = 0;

  if (hasMeasurementFee) {
    const result = calculateManagerWorkTotal({ ...order, items }, prices, isMeasurementPaidCash);
    totals = result.totals;
    managerTotal = result.managerTotal;
    measurementDeduction = result.measurementDeduction;
  } else {
    totals = calculateOrderTotals({ ...order, items }, prices);
    managerTotal = totals.grandTotal;
  }

  const baseMeasurementFee = resolveBaseMeasurementFee(prices);
  const storedMeasurementFee = hasMeasurementFee
    ? (totals.measurementFee > 0 ? totals.measurementFee : baseMeasurementFee)
    : 0;

  return {
    orderID: order.archiveId,
    customer: order.customer,
    items,
    deliveryCost: totals.deliveryCost,
    totalInstallCost: totals.installTotal,
    measurementRequired: hasMeasurementFee,
    measurementFee: hasMeasurementFee
      ? (measurementDeduction > 0 ? measurementDeduction : storedMeasurementFee)
      : 0,
    measurementPaidCash: hasMeasurementFee ? isMeasurementPaidCash : false,
    paymentMethod: totals.paymentMethod,
    paymentSurcharge: totals.paymentSurcharge,
    subtotalAfterDiscount: totals.subtotalAfterDiscount,
    grandTotal: totals.grandTotal,
    total: managerTotal,
    generalComment: order.generalComment || '',
  };
};

export const sendOrderToProduction = async (
  order: ArchiveOrderView,
  prices: typeof DEFAULT_PRICES,
  isMeasurementPaidCash = false
): Promise<void> => {
  const payload = buildSendToWorkPayload(order, prices, isMeasurementPaidCash);
  await postOrderToGoogleSheet(payload);
};

export const WORK_STATUS_IN_PRODUCTION: OrderWorkStatus = 'in_production';
export const WORK_STATUS_IN_PRODUCTION_LABEL = 'В работе';
