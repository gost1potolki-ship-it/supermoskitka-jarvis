import type { CalculatedOrderTotals } from '@calc/logic/orderTotals';
import type { OrderState } from '@calc/types';
import { formatCartExportItems } from './cart-item-export';

const DELIVERY_LABELS: Record<OrderState['deliveryType'], string> = {
  pickup: 'Самовывоз',
  city: 'По городу',
  out: 'За город',
};

function formatDateTime(d: Date): string {
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRubPlain(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} руб.`;
}

/** Текст корзины для скачивания в .txt */
export function formatCartOrder(order: OrderState, totals: CalculatedOrderTotals): string {
  const generatedAt = new Date();
  const lines: string[] = [];

  lines.push('ЗАКАЗ');
  lines.push(`Дата и время формирования: ${formatDateTime(generatedAt)}`);
  lines.push('');
  lines.push(`Клиент: ${order.customer?.name?.trim() || '—'}`);
  lines.push(`Телефон: ${order.customer?.phone?.trim() || '—'}`);
  lines.push(`Адрес: ${order.customer?.address?.trim() || '—'}`);
  lines.push('');

  lines.push(...formatCartExportItems(order.items));

  lines.push('');
  lines.push(`Стоимость изделий: ${formatRubPlain(totals.itemsTotalWithFee)}`);
  lines.push(`Монтаж: ${formatRubPlain(totals.installTotal)}`);
  const deliveryLabel = DELIVERY_LABELS[order.deliveryType] ?? order.deliveryType;
  if (order.deliveryType === 'out' && order.deliveryKm > 0) {
    lines.push(`Доставка: ${deliveryLabel} (${order.deliveryKm} км) (${formatRubPlain(totals.deliveryCost)})`);
  } else {
    lines.push(`Доставка: ${deliveryLabel} (${formatRubPlain(totals.deliveryCost)})`);
  }
  if (totals.discountAmount > 0) {
    lines.push(`Скидка ${totals.discountPercent}%: −${formatRubPlain(totals.discountAmount)}`);
  }
  if (totals.paymentSurcharge > 0) {
    lines.push(`Оплата по QR (+8%): ${formatRubPlain(totals.paymentSurcharge)}`);
  }
  if (order.generalComment?.trim()) {
    lines.push(`Комментарий: ${order.generalComment.trim()}`);
  }
  lines.push(`Итоговая сумма: ${formatRubPlain(totals.grandTotal)}`);

  return lines.join('\n');
}

export function saveTextFile(fileBaseName: string, text: string): void {
  const safeName = fileBaseName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Заказ';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
