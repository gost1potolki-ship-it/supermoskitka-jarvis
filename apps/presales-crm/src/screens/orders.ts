import { calculateOrderTotals } from '@calc/logic/orderTotals';
import { PRICES as DEFAULT_PRICES } from '@calc/constants';
import type { ArchivedOrder } from '@calc/types';
import { btn, el, segmentToggle } from '../dom';
import {
  ARCHIVE_FILTER_LABELS,
  formatArchiveDate,
  isPickupArchiveOrder,
  WORK_STATUS_LABELS,
  type ArchiveFilter,
  type ArchiveOrderView,
} from '../lib/archive';

export interface OrdersScreenDeps {
  orders: ArchiveOrderView[];
  filter: ArchiveFilter;
  prices: typeof DEFAULT_PRICES;
  onFilterChange: (filter: ArchiveFilter) => void;
  onEdit: (order: ArchivedOrder) => void;
  onDelete: (order: ArchiveOrderView) => void;
  onSendToWork: (order: ArchiveOrderView) => void;
  onRefresh: () => void;
  sendingId: string | null;
}

const FILTER_OPTIONS: { value: ArchiveFilter; label: string }[] = [
  { value: 'waiting', label: ARCHIVE_FILTER_LABELS.waiting },
  { value: 'in_production', label: ARCHIVE_FILTER_LABELS.in_production },
  { value: 'ready', label: ARCHIVE_FILTER_LABELS.ready },
  { value: 'pickup', label: ARCHIVE_FILTER_LABELS.pickup },
];

export function renderOrdersScreen(deps: OrdersScreenDeps): HTMLElement {
  const section = el('section', 'orders-page');

  const header = el('div', 'list-page-header');
  header.appendChild(el('h2', 'list-page-title', `Заказы (${deps.orders.length})`));
  header.appendChild(btn('Обновить', deps.onRefresh, 'btn-header'));
  section.appendChild(header);

  section.appendChild(
    segmentToggle(FILTER_OPTIONS, deps.filter, (v) => deps.onFilterChange(v as ArchiveFilter), 'status-filters')
  );

  if (deps.orders.length === 0) {
    section.appendChild(el('p', 'list-empty', 'Нет заказов в этом статусе'));
    return section;
  }

  const list = el('div', 'orders-list');
  for (const order of deps.orders) {
    list.appendChild(renderOrderCard(order, deps));
  }
  section.appendChild(list);
  return section;
}

function statusBadgeClass(order: ArchiveOrderView): string {
  if (isPickupArchiveOrder(order)) return 'status-badge status-badge--pickup';
  const status = order.workStatus ?? 'waiting';
  if (status === 'in_production') return 'status-badge status-badge--production';
  if (status === 'ready') return 'status-badge status-badge--ready';
  return 'status-badge status-badge--waiting';
}

function statusLabel(order: ArchiveOrderView): string {
  if (isPickupArchiveOrder(order) && order.workStatus !== 'waiting') return 'Самовывоз';
  return order.workStatusLabel || WORK_STATUS_LABELS[order.workStatus ?? 'waiting'];
}

function renderOrderCard(order: ArchiveOrderView, deps: OrdersScreenDeps): HTMLElement {
  const card = el('article', 'order-card');
  const items = Array.isArray(order.items) ? order.items : [];
  const totals = calculateOrderTotals({ ...order, items }, deps.prices);
  const docId = order.firestoreId || order.archiveId;

  const top = el('div', 'card-top');
  const titleWrap = el('div', 'card-title-wrap');
  titleWrap.appendChild(el('h3', 'card-title', order.customer?.name || 'Без имени'));
  titleWrap.appendChild(el('span', 'card-date', formatArchiveDate(order.date)));
  top.appendChild(titleWrap);
  top.appendChild(el('span', statusBadgeClass(order), statusLabel(order)));
  card.appendChild(top);

  if (order.customer?.phone) {
    const phoneRow = el('div', 'card-row');
    phoneRow.appendChild(el('span', 'card-label', 'Телефон'));
    phoneRow.appendChild(el('span', 'card-value', order.customer.phone));
    card.appendChild(phoneRow);
  }

  if (order.customer?.address) {
    const addrRow = el('div', 'card-row');
    addrRow.appendChild(el('span', 'card-label', 'Адрес'));
    addrRow.appendChild(el('span', 'card-value', order.customer.address));
    card.appendChild(addrRow);
  }

  const sumRow = el('div', 'card-row card-sum');
  sumRow.appendChild(el('span', 'card-label', 'Сумма'));
  sumRow.appendChild(el('span', 'card-amount', `${totals.grandTotal.toLocaleString('ru-RU')} ₽`));
  card.appendChild(sumRow);

  if (items.length > 0) {
    const itemsPreview = el('div', 'card-items-preview');
    const preview = items.slice(0, 3).map((item, i) => `${i + 1}. ${item.type}`).join(' · ');
    const suffix = items.length > 3 ? ` (+${items.length - 3})` : '';
    itemsPreview.textContent = preview + suffix;
    card.appendChild(itemsPreview);
  }

  if (order.syncStatus === 'pending') {
    card.appendChild(el('span', 'sync-hint', 'Синхронизация…'));
  } else if (order.syncStatus === 'error') {
    card.appendChild(el('span', 'sync-hint sync-hint--error', order.syncError || 'Ошибка синхронизации'));
  }

  const actions = el('div', 'card-actions');
  const canEdit = (order.workStatus ?? 'waiting') === 'waiting';
  const canSend = canEdit && items.length > 0;
  const isSending = deps.sendingId === docId;

  if (canEdit) {
    actions.appendChild(btn('Редактировать', () => deps.onEdit(order), 'btn-secondary btn-sm'));
  }
  if (canSend) {
    actions.appendChild(
      btn(isSending ? 'Отправка…' : 'В работу', () => deps.onSendToWork(order), 'btn-primary btn-sm', isSending)
    );
  }
  actions.appendChild(
    btn('Удалить', () => {
      if (window.confirm('Удалить заказ из архива?')) deps.onDelete(order);
    }, 'btn-danger btn-sm')
  );
  card.appendChild(actions);

  return card;
}
