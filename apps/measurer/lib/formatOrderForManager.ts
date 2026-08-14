/**
 * Текст замерного листа для менеджера (ВКонтакте и др.) — обычный текст, переносы \n, без HTML.
 */
import type { OrderState, CartItem } from '../types';
import { ProductType } from '../types';
import { PRICES, COLOR_LABELS, MESH_LABELS, MOUNT_LABELS, OPENING_LABELS, THRESHOLD_LABELS, CORNER_LABELS, HANDLE_LABELS } from '../constants';
import { roundToTens } from '../logic/calculations';

const MAINTENANCE_TYPES: ProductType[] = [
  ProductType.SEAL,
  ProductType.COMB,
  ProductType.CHILD_LOCK,
  ProductType.ADJUSTMENT,
];

function isProductItem(item: CartItem): boolean {
  return !MAINTENANCE_TYPES.includes(item.type);
}

function getLineProductDisplayRub(order: OrderState, itemIndexZero: number): number {
  const items = order.items;
  const item = items[itemIndexZero];
  const measurementFee = PRICES.price_settings.logistics.measurement_fee ?? 1000;
  const productCount = items.filter(isProductItem).length;
  if (!isProductItem(item) || order.includeMeasurementFee !== true || productCount === 0) {
    return item.price;
  }
  const feePerProduct = measurementFee / productCount;
  const productIndices = items.map((it, i) => (isProductItem(it) ? i : -1)).filter((i): i is number => i >= 0);
  const lastProductIdx = productIndices[productIndices.length - 1]!;
  const itemsBasePrice = items.reduce((sum, it) => sum + it.price, 0);
  const itemsTotalWithFee = itemsBasePrice + measurementFee;
  if (itemIndexZero === lastProductIdx) {
    const othersSum = items.reduce((sum, it, i) => {
      if (i === itemIndexZero) return sum;
      return sum + (isProductItem(it) ? roundToTens(Math.round(it.price + feePerProduct)) : it.price);
    }, 0);
    return itemsTotalWithFee - othersSum;
  }
  return roundToTens(Math.round(item.price + feePerProduct));
}

function formatRub(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

export interface OrderTotals {
  total: number;
  deliveryCost: number;
  totalInstallCost: number;
}

function label(value: string | undefined, labels: Record<string, string>): string {
  if (!value) return '—';
  return labels[value] ?? value;
}

function getShortTypeName(item: CartItem): string {
  switch (item.type) {
    case ProductType.FRAME:
      return 'Рамочная сетка';
    case ProductType.WING:
      return 'Крыло';
    case ProductType.INSIDE_INSERT:
      return 'Внутривставная VSN';
    case ProductType.DOOR:
      return item.doorProfile ? `Дверная распашная (${item.doorProfile} мм)` : 'Дверная распашная';
    case ProductType.PLISSE_NET:
      return 'Сетка плиссе';
    case ProductType.ROLL:
      return 'Рулонная сетка';
    case ProductType.JALOUSIE_CLASSIC:
      return 'Штора Портал';
    case ProductType.JALOUSIE_LIGHT:
      return 'Штора плиссе Light';
    case ProductType.JALOUSIE_COZY:
      return 'Штора плиссе (по цвету)';
    case ProductType.SEAL:
      return 'Замена уплотнителя';
    case ProductType.COMB:
      return 'Гребенка';
    case ProductType.CHILD_LOCK:
      return 'Детский замок';
    case ProductType.ADJUSTMENT:
      return 'Регулировка';
    default:
      return String(item.type);
  }
}

function formatItemBlock(item: CartItem, displayIndex: number, order: OrderState, itemIndexZero: number): string {
  const lines: string[] = [];
  const qty = item.quantity ?? 1;

  lines.push(`🎈 Позиция ${displayIndex}:`);
  lines.push(`Вид: ${getShortTypeName(item)}`);
  lines.push(`Кол-во: ${qty} шт.`);

  if (item.mesh && (item.type === ProductType.FRAME || item.type === ProductType.WING || item.type === ProductType.DOOR || item.type === ProductType.INSIDE_INSERT || item.type === ProductType.PLISSE_NET || item.type === ProductType.ROLL)) {
    lines.push(`Полотно: ${label(item.mesh, MESH_LABELS)}`);
  }
  if (item.type === ProductType.JALOUSIE_CLASSIC || item.type === ProductType.JALOUSIE_LIGHT || item.type === ProductType.JALOUSIE_COZY) {
    lines.push(`Ткань: ${label(item.mesh, MESH_LABELS)}`);
  }

  if (item.color != null) {
    lines.push(`Цвет профиля: ${label(item.color, COLOR_LABELS)}`);
  }

  if (item.type === ProductType.FRAME && item.frameProfile) {
    lines.push(`Профиль: ${item.frameProfile} мм`);
  }
  if (item.type === ProductType.WING) {
    lines.push('Профиль: крыло');
  }
  if (item.type === ProductType.INSIDE_INSERT) {
    lines.push('Профиль: VSN');
  }
  if (item.type === ProductType.DOOR && item.doorProfile) {
    lines.push(`Профиль: ${item.doorProfile} мм`);
  }

  if (item.width != null && item.height != null) {
    lines.push(`Размер: ${item.width} × ${item.height} мм`);
  }

  if (item.mount != null && (item.type === ProductType.FRAME || item.type === ProductType.WING || item.type === ProductType.INSIDE_INSERT)) {
    lines.push(`Крепеж: ${label(item.mount, MOUNT_LABELS)}`);
  }

  if (item.type === ProductType.FRAME || item.type === ProductType.WING) {
    lines.push(`Уголки: ${label(item.cornerType ?? 'plastic', CORNER_LABELS)}`);
    if (item.handleType === 'metal') {
      lines.push(`Ручки: ${label(item.handleType, HANDLE_LABELS)}`);
    }
  }

  if (item.type === ProductType.DOOR) {
    if (item.hingesCount != null && item.hingesCount > 0) {
      lines.push(`Петли: ${item.hingesCount} шт.`);
    }
    if (item.hasLatch) {
      lines.push('Защелка: да');
    }
    if (item.hasBolt) {
      lines.push('Шпингалет: да');
    }
  }

  if (item.type === ProductType.PLISSE_NET || item.type === ProductType.JALOUSIE_CLASSIC || item.type === ProductType.JALOUSIE_COZY) {
    if (item.opening) {
      lines.push(`Открывание: ${label(item.opening, OPENING_LABELS)}`);
    }
  }

  if (item.type === ProductType.PLISSE_NET) {
    const thresholdText = item.threshold ? label(item.threshold, THRESHOLD_LABELS) : 'Стандарт';
    lines.push(`Порог: ${thresholdText}`);
    if (item.handles != null && item.handles > 0) {
      lines.push(`Ручки: ${item.handles} шт.`);
    } else {
      lines.push('Ручки: —');
    }
  }

  const lineProductRub = getLineProductDisplayRub(order, itemIndexZero);
  lines.push(`Стоимость по позиции (изделия): ${formatRub(lineProductRub)}`);

  if (item.comment) {
    lines.push(`Заметка: ${item.comment}`);
  }

  return lines.join('\n');
}

/**
 * Собирает текст заявки для отправки менеджеру (VK messages.send — только plain text).
 */
export function formatOrderForManager(order: OrderState, totals: OrderTotals): string {
  const blocks: string[] = [];

  blocks.push('📦 ЗАМЕРНЫЙ ЛИСТ');
  blocks.push('');

  const name = order.customer?.name?.trim() || '—';
  const phone = order.customer?.phone?.trim() || '—';
  const address = order.customer?.address?.trim() || '—';
  blocks.push(`👤 Клиент: ${name}`);
  blocks.push(`📞 Телефон: ${phone}`);
  blocks.push(`📍 Адрес: ${address}`);
  blocks.push('');

  order.items.forEach((item, i) => {
    blocks.push(formatItemBlock(item, i + 1, order, i));
    if (i < order.items.length - 1) blocks.push('');
  });

  blocks.push('');

  const discountPercent =
    order.orderDiscountPercent === 5 || order.orderDiscountPercent === 10 ? order.orderDiscountPercent : 0;
  if (discountPercent > 0) {
    const productCount = order.items.filter(isProductItem).length;
    const measurementFee = PRICES.price_settings.logistics.measurement_fee ?? 1000;
    const itemsBasePrice = order.items.reduce((sum, it) => sum + it.price, 0);
    const itemsTotalWithFee =
      itemsBasePrice + (order.includeMeasurementFee === true && productCount > 0 ? measurementFee : 0);
    const subtotalBeforeDiscount = itemsTotalWithFee + totals.totalInstallCost + totals.deliveryCost;
    const discountRub = Math.round(subtotalBeforeDiscount - totals.total);
    blocks.push(`🏷 Скидка на заказ: ${discountPercent}% (−${discountRub.toLocaleString('ru-RU')} руб.)`);
    blocks.push('');
  }

  const deliveryText = order.deliveryType === 'pickup'
    ? 'Самовывоз'
    : totals.deliveryCost > 0
      ? `Да (${totals.deliveryCost} ₽)`
      : 'Да';
  blocks.push(`🚚 Доставка: ${deliveryText}`);
  blocks.push(`🛠 Монтаж: ${order.globalInstall ? (totals.totalInstallCost > 0 ? `Да (${totals.totalInstallCost} ₽)` : 'Да') : 'Нет'}`);

  const totalStr = totals.total.toLocaleString('ru-RU');
  blocks.push(`💰 Итоговая сумма заказа включая изделия и услуги: ${totalStr} руб.`);

  if (order.generalComment?.trim()) {
    blocks.push('');
    blocks.push(`Комментарий: ${order.generalComment.trim()}`);
  }

  return blocks.join('\n');
}
