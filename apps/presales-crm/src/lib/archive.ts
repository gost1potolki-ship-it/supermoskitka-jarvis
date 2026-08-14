import type { ArchivedOrder, OrderWorkStatus } from '@calc/types';

export type ArchiveFilter = 'waiting' | 'in_production' | 'ready' | 'pickup';

export const WORK_STATUS_LABELS: Record<OrderWorkStatus, string> = {
  waiting: 'Ожидание',
  in_production: 'В работе',
  ready: 'Готов',
};

export const ARCHIVE_FILTER_LABELS: Record<ArchiveFilter, string> = {
  waiting: 'Ожидание',
  in_production: 'В работе',
  ready: 'Готовые',
  pickup: 'Самовывоз',
};

export interface ArchiveOrderView extends ArchivedOrder {
  firestoreId?: string;
  address?: string;
  isPickup?: boolean;
  hasPendingWrites?: boolean;
  syncStatus?: 'pending' | 'error';
  syncError?: string;
}

export const isPickupArchiveOrder = (order: ArchiveOrderView): boolean => {
  const address = String(order.address || order.customer?.address || '').trim().toLowerCase();
  const deliveryType = String(order.deliveryType || '').trim().toLowerCase();
  return (
    order.isPickup === true
    || address === 'самовывоз'
    || deliveryType === 'самовывоз'
    || deliveryType === 'pickup'
  );
};

export const normalizeArchiveOrder = (
  data: Record<string, unknown> & Partial<ArchivedOrder>,
  docId?: string
): ArchiveOrderView => {
  const firestoreId = docId || (typeof data.firestoreId === 'string' ? data.firestoreId : undefined);
  const archiveId = typeof data.archiveId === 'string' ? data.archiveId : (firestoreId || '');
  const items = Array.isArray(data.items) ? data.items : [];
  const workStatus: OrderWorkStatus =
    data.workStatus === 'in_production' || data.workStatus === 'ready' ? data.workStatus : 'waiting';

  const flatName = typeof data.name === 'string' ? data.name : '';
  const flatPhone = typeof data.phone === 'string' ? data.phone : '';
  const flatAddress = typeof data.address === 'string' ? data.address : '';
  const customer = data.customer && typeof data.customer === 'object'
    ? (data.customer as { name?: string; phone?: string; address?: string })
    : {};

  const resolvedAddress = customer.address || flatAddress || '';
  const normalizedAddress = resolvedAddress.trim().toLowerCase();
  const normalizedDeliveryType = String(data.deliveryType || '').trim().toLowerCase();
  const isPickup =
    data.isPickup === true
    || normalizedAddress === 'самовывоз'
    || normalizedDeliveryType === 'pickup'
    || normalizedDeliveryType === 'самовывоз';

  return {
    archiveId,
    firestoreId,
    items,
    address: flatAddress || resolvedAddress,
    isPickup,
    deliveryType: isPickup ? 'pickup' as const : ((data.deliveryType as ArchivedOrder['deliveryType']) ?? 'city'),
    deliveryKm: Number(data.deliveryKm) || 0,
    globalInstall: data.globalInstall !== false,
    includeMeasurementFee: data.includeMeasurementFee !== false,
    paymentMethod: (data.paymentMethod as ArchivedOrder['paymentMethod']) ?? 'cash',
    orderDiscountPercent:
      data.orderDiscountPercent === 5 || data.orderDiscountPercent === 10
        ? data.orderDiscountPercent
        : 0,
    generalComment: typeof data.generalComment === 'string' ? data.generalComment : undefined,
    installOverride: (data.installOverride as ArchivedOrder['installOverride']) ?? null,
    workStatus,
    workStatusLabel:
      typeof data.workStatusLabel === 'string'
        ? data.workStatusLabel
        : WORK_STATUS_LABELS[workStatus],
    customer: {
      name: customer.name || flatName || '',
      phone: customer.phone || flatPhone || '',
      address: customer.address || flatAddress || '',
    },
    date: typeof data.date === 'string' ? data.date : '',
    hasPendingWrites: Boolean(data.hasPendingWrites),
    syncToken: typeof data.syncToken === 'string' ? data.syncToken : undefined,
  };
};

export const resolveArchiveWorkStatus = (
  existing?: ArchivedOrder | null
): Pick<ArchivedOrder, 'workStatus' | 'workStatusLabel'> => {
  const status: OrderWorkStatus = existing?.workStatus ?? 'waiting';
  return {
    workStatus: status,
    workStatusLabel: existing?.workStatusLabel || WORK_STATUS_LABELS[status],
  };
};

export const filterArchiveOrders = (orders: ArchiveOrderView[], filter: ArchiveFilter): ArchiveOrderView[] => {
  return orders.filter((order) => {
    const pickup = isPickupArchiveOrder(order);
    const status = order.workStatus ?? 'waiting';

    if (filter === 'waiting') return status === 'waiting';
    if (filter === 'ready') return !pickup && status === 'ready';
    if (filter === 'in_production') return !pickup && status === 'in_production';
    if (filter === 'pickup') return pickup && status !== 'waiting';
    return !pickup;
  });
};

export const formatArchiveDate = (dateStr?: string): string => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
