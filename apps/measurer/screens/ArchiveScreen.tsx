import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ArchivedOrder, CartItem, ProductType, OrderWorkStatus } from '../types';
import { PRICES as DEFAULT_PRICES, COLOR_LABELS, MESH_LABELS, MOUNT_LABELS, CORNER_LABELS, OPENING_LABELS, THRESHOLD_LABELS } from '../constants';
import { Trash2, Share2, Calendar, User, MapPin, Clock, Truck, Hammer, Info, X, Cloud, Phone, Loader2, Pencil, Map, RefreshCw } from 'lucide-react';
import { phoneE164Russia } from '../lib/phone';
import IconMapColor from '../components/IconMapColor';
import IconRouteColor from '../components/IconRouteColor';
import paymentQrImage from '../assets/payment-qr.png';
import { calculateOrderTotals, parseArchiveAmount, parseArchiveStoredTotal, resolveArchiveDisplayTotal, calculateManagerWorkTotal } from '../logic/orderTotals';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const ARCHIVE_WORK_STATUS_LABELS: Record<OrderWorkStatus, string> = {
  waiting: 'В ожидании',
  in_production: 'В производстве',
  ready: 'Готов к монтажу',
};

type ArchiveOrderWithTotal = ArchivedOrder & {
  firestoreId?: string;
  total?: number;
  orderTotal?: number;
  amount?: number;
  amount_rub?: number;
  items_summary?: string;
  isPickup?: boolean;
  address?: string;
  sheetRow?: string | number;
  googleSheetRow?: string | number;
};

type ArchiveFilter = 'waiting' | 'in_production' | 'ready' | 'pickup';

export function isPickupArchiveOrder(order: ArchiveOrderWithTotal | ArchivedOrder): boolean {
  const orderRecord = order as ArchiveOrderWithTotal;
  const address = String(orderRecord.address || order.customer?.address || '').trim().toLowerCase();
  const deliveryType = String(order.deliveryType || '').trim().toLowerCase();
  return (
    orderRecord.isPickup === true
    || address === 'самовывоз'
    || deliveryType === 'самовывоз'
    || deliveryType === 'pickup'
  );
}

const ARCHIVE_FILTER_OPTIONS: { id: ArchiveFilter; label: string }[] = [
  { id: 'waiting', label: 'Ожидание' },
  { id: 'in_production', label: 'В работе' },
  { id: 'ready', label: 'Готовые' },
  { id: 'pickup', label: 'Самовывоз' },
];

const GOOGLE_SHEET_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbwTxjc7EjUxMwtHm2_n79CvX3AcyOhBjcylX4AUIQCAa1CvNwLILxunX0mZiM_Grc9b/exec';

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

type WebhookSheetResponse = {
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

async function postOrderToGoogleSheet(payload: Record<string, unknown>): Promise<WebhookSheetResponse> {
  console.log('[SEND_TO_MANAGER] payload', payload);

  let response: Response;
  let responseText: string;
  try {
    response = await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });
    responseText = await response.text();
  } catch (error) {
    console.error('[SEND_TO_MANAGER] webhook failed', error);
    throw error instanceof Error ? error : new Error(String(error));
  }

  let parsed: WebhookSheetResponse | null = null;
  try {
    parsed = JSON.parse(responseText) as WebhookSheetResponse;
    console.log('[SEND_TO_MANAGER] webhook response', response.status, parsed);
  } catch {
    console.log('[SEND_TO_MANAGER] webhook response', response.status, responseText);
  }

  if (!response.ok) {
    const detail = parsed?.error || responseText.slice(0, 300) || `HTTP ${response.status}`;
    console.error('[SEND_TO_MANAGER] webhook failed', detail);
    throw new Error(`Webhook HTTP ${response.status}: ${detail}`);
  }

  if (parsed && (parsed.ok === false || parsed.success === false)) {
    const errorDetails =
      parsed.error ||
      parsed.message ||
      parsed.details ||
      JSON.stringify(parsed);
    console.error('[SEND_TO_MANAGER] webhook failed', errorDetails, parsed);
    throw new Error(`Google Apps Script вернул ошибку: ${errorDetails}`);
  }

  if (!parsed) {
    console.error('[SEND_TO_MANAGER] webhook failed', 'Не JSON ответ', responseText.slice(0, 300));
    throw new Error(`Webhook вернул не JSON: ${responseText.slice(0, 300)}`);
  }

  console.log('[SEND_TO_MANAGER] webhook parsed result', parsed);
  console.log('[SEND_TO_MANAGER] webhook parsed result FULL', JSON.stringify(parsed, null, 2));

  if (!isWebhookSheetSuccess(parsed)) {
    console.error('[SEND_TO_MANAGER] webhook failed', 'rowsCreated=0 and no duplicate confirmation', parsed);
    throw new Error(
      `Google Таблица не создала строку заказа и не подтвердила дубль по archiveId. Ответ webhook: ${JSON.stringify(parsed)}`
    );
  }

  return parsed;
}

const SHEET_ACK_STORAGE_KEY = 'measurer_sheet_ack_v1';

const SHEET_ACK_FIRESTORE_RETRY_MESSAGE =
  'Заказ уже отправлен в Google Таблицу, но не удалось обновить статус в приложении. Нажмите «Отправить в работу» ещё раз — приложение обновит статус без повторного добавления строки в таблицу.';

type SheetAckEntry = {
  archiveId: string;
  acknowledgedAt: string;
  webhookResponse: WebhookSheetResponse;
  rowsCreated?: number;
  rows?: WebhookSheetRowRef[];
  existingRows?: WebhookSheetRowRef[];
  duplicate?: boolean;
};

type SheetAckMap = Record<string, SheetAckEntry>;

const loadSheetAckMap = (): SheetAckMap => {
  try {
    const raw = localStorage.getItem(SHEET_ACK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SheetAckMap;
  } catch (error) {
    console.warn('[SEND_TO_MANAGER] failed to load sheetAck map', error);
    return {};
  }
};

const saveSheetAckMap = (map: SheetAckMap): void => {
  localStorage.setItem(SHEET_ACK_STORAGE_KEY, JSON.stringify(map));
};

const getSheetAck = (archiveId: string): SheetAckEntry | null => {
  const entry = loadSheetAckMap()[archiveId];
  return entry && typeof entry === 'object' ? entry : null;
};

const setSheetAck = (archiveId: string, response: WebhookSheetResponse): void => {
  const result = response.result;
  const map = loadSheetAckMap();
  map[archiveId] = {
    archiveId,
    acknowledgedAt: new Date().toISOString(),
    webhookResponse: response,
    rowsCreated: result?.rowsCreated,
    rows: result?.rows,
    existingRows: result?.existingRows,
    duplicate: response.duplicate === true || result?.duplicate === true,
  };
  saveSheetAckMap(map);
};

const clearSheetAck = (archiveId: string): void => {
  const map = loadSheetAckMap();
  if (!(archiveId in map)) return;
  delete map[archiveId];
  saveSheetAckMap(map);
};

export interface ArchiveWorkStatusPaymentUpdate {
  measurementRequired: boolean;
  measurementPaidCash: boolean;
  measurementFee: number;
  grandTotal: number;
  managerTotal: number;
  amountDue: number;
  total: number;
}

const resolveBaseMeasurementFee = (prices: typeof DEFAULT_PRICES): number =>
  Math.max(
    DEFAULT_PRICES.price_settings.logistics.measurement_fee ?? 1000,
    prices.price_settings.logistics.measurement_fee ?? 0
  );

const resolveArchivePaymentDisplay = (
  order: ArchivedOrder,
  items: CartItem[],
  prices: typeof DEFAULT_PRICES
) => {
  const totals = calculateOrderTotals({ ...order, items }, prices);
  const measurementRequired = order.measurementRequired === true;
  const measurementPaidCash = order.measurementPaidCash === true;

  if (order.measurementRequired === false) {
    const amountDue =
      order.amountDue ??
      order.managerTotal ??
      parseArchiveAmount((order as ArchiveOrderWithTotal).total) ??
      totals.grandTotal;
    return {
      displayMode: 'customer_sizes' as const,
      amountDue,
      totals,
    };
  }

  if (measurementPaidCash) {
    const fullCalc = calculateManagerWorkTotal({ ...order, items }, prices, true);
    const grandTotal = order.grandTotal ?? fullCalc.totals.grandTotal;
    const measurementFee = order.measurementFee ?? fullCalc.totals.measurementFee ?? resolveBaseMeasurementFee(prices);
    const amountDue =
      order.amountDue ??
      order.managerTotal ??
      parseArchiveAmount((order as ArchiveOrderWithTotal).total) ??
      fullCalc.managerTotal;

    return {
      displayMode: 'deposit_paid' as const,
      grandTotal,
      measurementFee,
      amountDue,
      totals,
    };
  }

  if (measurementRequired && !measurementPaidCash) {
    const fullCalc = calculateManagerWorkTotal({ ...order, items }, prices, false);
    const grandTotal = order.grandTotal ?? fullCalc.totals.grandTotal;
    const measurementFee = order.measurementFee ?? fullCalc.totals.measurementFee ?? resolveBaseMeasurementFee(prices);
    const amountDue =
      order.amountDue ??
      order.managerTotal ??
      parseArchiveAmount((order as ArchiveOrderWithTotal).total) ??
      grandTotal;

    return {
      displayMode: 'deposit_included' as const,
      amountDue,
      measurementFee,
      totals,
    };
  }

  return {
    displayMode: 'default' as const,
    displayTotal: resolveArchiveDisplayTotal(order, totals.grandTotal),
    totals,
  };
};

export function normalizeArchiveOrder(
  data: Partial<ArchivedOrder> | Record<string, unknown> | unknown,
  docId?: string
): ArchiveOrderWithTotal {
  const raw = (data || {}) as Record<string, unknown> & Partial<ArchivedOrder>;
  const firestoreId = docId || (typeof raw.firestoreId === 'string' ? raw.firestoreId : undefined);
  const archiveId = typeof raw.archiveId === 'string' ? raw.archiveId : (firestoreId || '');
  const items = Array.isArray(raw.items) ? raw.items : [];
  const workStatus: OrderWorkStatus =
    raw.workStatus === 'in_production' || raw.workStatus === 'ready' ? raw.workStatus : 'waiting';

  if (!Array.isArray(raw.items)) {
    console.warn('Archive order has no items array', { archiveId, firestoreId, order: raw });
  }

  const flatName = typeof raw.name === 'string' ? raw.name : '';
  const flatPhone = typeof raw.phone === 'string' ? raw.phone : '';
  const flatAddress = typeof raw.address === 'string' ? raw.address : '';
  const customer = raw.customer && typeof raw.customer === 'object'
    ? raw.customer as { name?: string; phone?: string; address?: string }
    : {};

  const storedTotal = parseArchiveStoredTotal(raw);
  const measurementRequired = raw.measurementRequired === true ? true : raw.measurementRequired === false ? false : undefined;
  const measurementPaidCash = raw.measurementPaidCash === true;
  const resolvedAddress = customer.address || flatAddress || '';
  const normalizedAddress = resolvedAddress.trim().toLowerCase();
  const normalizedDeliveryType = String(raw.deliveryType || '').trim().toLowerCase();
  const isPickup =
    raw.isPickup === true
    || normalizedAddress === 'самовывоз'
    || normalizedDeliveryType === 'pickup'
    || normalizedDeliveryType === 'самовывоз';

  return {
    ...(raw as ArchivedOrder),
    archiveId,
    firestoreId,
    items,
    address: flatAddress || resolvedAddress,
    isPickup,
    ...(isPickup ? { deliveryType: 'pickup' as const } : {}),
    workStatus,
    workStatusLabel:
      typeof raw.workStatusLabel === 'string'
        ? raw.workStatusLabel
        : ARCHIVE_WORK_STATUS_LABELS[workStatus],
    measurementPaidCash,
    ...(measurementRequired !== undefined ? { measurementRequired } : {}),
    ...(raw.measurementFee != null ? { measurementFee: parseArchiveAmount(raw.measurementFee) } : {}),
    ...(raw.managerTotal != null ? { managerTotal: parseArchiveAmount(raw.managerTotal) } : {}),
    ...(raw.grandTotal != null ? { grandTotal: parseArchiveAmount(raw.grandTotal) } : {}),
    ...(raw.amountDue != null ? { amountDue: parseArchiveAmount(raw.amountDue) } : {}),
    total: storedTotal,
    orderTotal: parseArchiveAmount(raw.orderTotal) || storedTotal,
    amount: parseArchiveAmount(raw.amount) || storedTotal,
    amount_rub: parseArchiveAmount(raw.amount_rub) || storedTotal,
    customer: {
      name: customer.name || flatName || '',
      phone: customer.phone || flatPhone || '',
      address: customer.address || flatAddress || '',
    },
    date: typeof raw.date === 'string' ? raw.date : '',
  };
}

interface ArchiveScreenProps {
  archive: ArchivedOrder[];
  onDelete: (id: string) => void;
  onEditArchive: (order: ArchivedOrder) => void;
  onWorkStatusUpdated?: (
    archiveId: string,
    workStatus: OrderWorkStatus,
    workStatusLabel: string,
    paymentUpdate?: ArchiveWorkStatusPaymentUpdate
  ) => void;
  onRefresh?: () => Promise<void> | void;
  prices: typeof DEFAULT_PRICES;
}

const ArchiveScreen: React.FC<ArchiveScreenProps> = ({ archive, onDelete, onEditArchive, onWorkStatusUpdated, onRefresh, prices }) => {
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('ready');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmPaymentOrder, setConfirmPaymentOrder] = useState<ArchivedOrder | null>(null);
  const [mapPickerOrder, setMapPickerOrder] = useState<ArchivedOrder | null>(null);
  const [showPaymentQr, setShowPaymentQr] = useState(false);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const WORK_STATUS_LABELS: Record<OrderWorkStatus, string> = {
    waiting: 'В ожидании',
    in_production: 'В производстве',
    ready: 'Готов к монтажу',
  };
  const resolveWorkStatus = (order: ArchivedOrder): { code: OrderWorkStatus; label: string } => {
    const code = order.workStatus ?? 'waiting';
    return {
      code,
      label: order.workStatusLabel || WORK_STATUS_LABELS[code],
    };
  };

  const label = (value: string | undefined, labels: Record<string, string>): string => {
    if (!value) return '—';
    return labels[value] ?? value;
  };

  const splitItemsByQuantity = (items: CartItem[]): CartItem[] => {
    const isWindowServiceType = (type: ProductType): boolean => {
      return (
        type === ProductType.SEAL ||
        type === ProductType.COMB ||
        type === ProductType.CHILD_LOCK ||
        type === ProductType.ADJUSTMENT
      );
    };

    return items.flatMap((item) => {
      const qty = Math.max(1, item.quantity || 1);
      // Для блока "Обслуживание окон" НЕ разносить quantity на отдельные позиции.
      if (isWindowServiceType(item.type)) return [item];
      if (qty === 1) return [item];
      const unitPrice = Math.round(item.price / qty);
      const unitInstall = Math.round(item.installPrice / qty);
      return Array.from({ length: qty }, (_, i) => ({
        ...item,
        id: `${item.id}_${i + 1}`,
        quantity: 1,
        price: unitPrice,
        installPrice: unitInstall,
      }));
    });
  };

  const getArchiveItemDetails = (item: CartItem): string => {
    if (item.type === ProductType.FRAME) {
      const size = item.width && item.height ? `${item.width}x${item.height}` : '—';
      const mesh = label(item.mesh, MESH_LABELS);
      const profile = item.frameProfile ? `${item.frameProfile} мм` : '—';
      const color = label(item.color, COLOR_LABELS);
      const mount = label(item.mount, MOUNT_LABELS);
      const corners = label(item.cornerType ?? 'plastic', CORNER_LABELS);
      return `Размер: ${size} • Полотно: ${mesh} • Профиль: ${profile} • Цвет профиля: ${color} • Крепеж: ${mount} • Уголки: ${corners}`;
    }
    if (item.type === ProductType.WING) {
      const size = item.width && item.height ? `${item.width}x${item.height}` : '—';
      const mesh = label(item.mesh, MESH_LABELS);
      const color = label(item.color, COLOR_LABELS);
      return `Размер: ${size} • Полотно: ${mesh} • Профиль: крыло • Цвет профиля: ${color} • Крепеж: барашки • Уголки: базовые`;
    }
    if (item.type === ProductType.INSIDE_INSERT) {
      const size = item.width && item.height ? `${item.width}x${item.height}` : '—';
      const mesh = label(item.mesh, MESH_LABELS);
      const color = label(item.color, COLOR_LABELS);
      return `Размер: ${size} • Полотно: ${mesh} • Профиль: VSN • Цвет профиля: ${color} • Крепеж: распорки • Уголки: базовые`;
    }
    if (item.type === ProductType.PLISSE_NET) {
      const size = item.width && item.height ? `${item.width}x${item.height}` : '—';
      const openingRaw = item.opening ? label(item.opening, OPENING_LABELS) : '—';
      const opening = openingRaw === 'В одну сторону' ? 'В БОК' : openingRaw;
      const thresholdRaw = item.threshold ? label(item.threshold, THRESHOLD_LABELS) : 'Стандарт';
      const threshold = thresholdRaw === 'Стандарт' ? 'Обычный' : thresholdRaw;
      const mesh = label(item.mesh, MESH_LABELS);
      const color = label(item.color, COLOR_LABELS);
      const handles = item.handles != null ? `${item.handles}` : '—';
      return `Размер: ${size} • Тип открывания: ${opening} • Тип порога: ${threshold} • Полотно: ${mesh} • Цвет профиля: ${color} • Кол-во ручек: ${handles}`;
    }
    if (item.type === ProductType.JALOUSIE_CLASSIC) {
      const size = item.width && item.height ? `${item.width}x${item.height}` : '—';
      const openingRaw = item.opening ? label(item.opening, OPENING_LABELS) : '—';
      const opening = openingRaw === 'В одну сторону' ? 'В БОК' : openingRaw;
      const fabric = label(item.mesh, MESH_LABELS);
      const color = label(item.color, COLOR_LABELS);
      const handles = item.handles != null ? `${item.handles}` : '—';
      return `Размер: ${size} • Тип открывания: ${opening} • Ткань: ${fabric} • Цвет профиля: ${color} • Кол-во ручек: ${handles}`;
    }
    if (item.type === ProductType.JALOUSIE_COZY) {
      const size = item.width && item.height ? `${item.width}x${item.height}` : '—';
      const openingRaw = item.opening ? label(item.opening, OPENING_LABELS) : '—';
      const opening = openingRaw === 'В одну сторону' ? 'В БОК' : openingRaw;
      const fabric = label(item.mesh, MESH_LABELS);
      const color = label(item.color, COLOR_LABELS);
      return `Размер: ${size} • Тип открывания: ${opening} • Ткань: ${fabric} • Цвет профиля: ${color} • Кол-во ручек: —`;
    }
    if (item.type === ProductType.JALOUSIE_LIGHT) {
      const size = item.width && item.height ? `${item.width}x${item.height}` : '—';
      const fabric = label(item.mesh, MESH_LABELS);
      const color = label(item.color, COLOR_LABELS);
      return `Размер: ${size} • Тип открывания: — • Ткань: ${fabric} • Цвет профиля: ${color} • Кол-во ручек: —`;
    }
    if (item.type === ProductType.DOOR) {
      const size = item.width && item.height ? `${item.width}x${item.height}` : '—';
      const mesh = label(item.mesh, MESH_LABELS);
      const profile = item.doorProfile ? `${item.doorProfile} мм` : '—';
      const color = label(item.color, COLOR_LABELS);
      const hinges = item.hingesCount && item.hingesCount > 0 ? `${item.hingesCount} шт.` : '—';
      const hardware: string[] = [];
      if (item.hasLatch) hardware.push('защелка');
      if (item.hasBolt) hardware.push('шпингалет');
      const hardwareText = hardware.length > 0 ? hardware.join(', ') : '—';
      return `Размер: ${size} • Полотно: ${mesh} • Профиль: ${profile} • Цвет профиля: ${color} • Петли: ${hinges} • Доп. фурнитура: ${hardwareText}`;
    }
    return item.details;
  };

  const sortedArchive = useMemo(() => {
    return archive.map((order) => normalizeArchiveOrder(order));
  }, [archive]);

  const filteredArchive = useMemo(() => {
    return sortedArchive.filter((order) => {
      const pickup = isPickupArchiveOrder(order);
      const status = order.workStatus ?? 'waiting';

      if (archiveFilter === 'waiting') {
        return status === 'waiting';
      }
      if (archiveFilter === 'ready') {
        return !pickup && status === 'ready';
      }
      if (archiveFilter === 'in_production') {
        return !pickup && status === 'in_production';
      }
      if (archiveFilter === 'pickup') {
        return pickup && status !== 'waiting';
      }

      return !pickup;
    });
  }, [sortedArchive, archiveFilter]);

  useEffect(() => {
    setExpandedId(null);
  }, [archiveFilter]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.resolve(onRefresh?.());
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const buildArchiveReportText = (order: ArchivedOrder) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const totals = calculateOrderTotals({ ...order, items }, prices);
    const date = order.date;
    let text = `Архивный Замер [${date}]\n`;
    if (order.customer?.name || order.customer?.phone || order.customer?.address) {
      text += `Клиент: ${order.customer.name || '-'}\n`;
      text += `Тел: ${order.customer.phone || '-'}\n`;
      text += `Адрес: ${order.customer.address || '-'}\n\n`;
    }
    items.forEach((item, index) => {
      text += `${index + 1}. ${item.type}${item.width ? ` (${item.width}x${item.height})` : ''}, ${item.details} — ${item.quantity || 1} шт. — ${item.price}₽\n`;
      if (item.comment) text += `   [Заметка: ${item.comment}]\n`;
    });
    if (order.generalComment) text += `\nОБЩИЙ КОММЕНТАРИЙ: ${order.generalComment}\n`;
    text += `\n---\n`;
    if (order.globalInstall) text += `Монтаж: ${totals.installTotal}₽\n`;
    const kmStr = order.deliveryType === 'out' ? ` (${Number(order.deliveryKm) || 0} км)` : '';
    text += `Доставка: ${order.deliveryType === 'pickup' ? 'Самовывоз' : `${totals.deliveryCost}₽${kmStr}`}\n`;
    text += `ИТОГО: ${totals.grandTotal}₽`;
    return text;
  };

  const handleShareArchive = (order: ArchivedOrder) => {
    const text = buildArchiveReportText(order);
    if (navigator.share) {
      navigator.share({ title: 'Заказ из архива', text }).catch(console.error);
    } else {
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    }
  };

  const ZOOM_100M = 18;
  const normalizeAddressForSearch = (addr: string) => {
    const s = (addr || '').trim();
    if (!s) return '';
    return !s.toLowerCase().includes('санкт-петербург') ? `СПб, ${s}` : s;
  };

  const openMap = (order: ArchivedOrder) => {
    if (!order.customer?.address) return;
    setMapPickerOrder(order);
  };

  const openMapInApp = (app: 'yandex' | '2gis' | 'google', order: ArchivedOrder) => {
    const search = normalizeAddressForSearch(order.customer?.address || '');
    if (!search) return;
    const encoded = encodeURIComponent(search);
    const urls: Record<'yandex' | '2gis' | 'google', string> = {
      yandex: `https://yandex.ru/maps/?text=${encoded}&z=${ZOOM_100M}`,
      '2gis': `https://2gis.ru/search?query=${encoded}`,
      google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    };
    window.open(urls[app], '_blank');
    setMapPickerOrder(null);
  };

  const buildRoute = (order: ArchivedOrder) => {
    const search = normalizeAddressForSearch(order.customer?.address || '');
    if (!search) return;
    const deepLink = `yandexnavi://map_search?text=${encodeURIComponent(search)}`;
    window.location.href = deepLink;
    setTimeout(() => {
      if (!document.hidden) {
        window.open(`https://yandex.ru/maps/?text=${encodeURIComponent(search)}&mode=routes`, '_blank');
      }
    }, 1500);
  };

  const [sendingToManagerId, setSendingToManagerId] = useState<string | null>(null);
  const [sendStatusByDocId, setSendStatusByDocId] = useState<Record<string, 'success' | 'error'>>({});

  const isMountedRef = useRef(true);
  const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      timeoutIdsRef.current.forEach((id) => clearTimeout(id));
      timeoutIdsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!expandedId) return;
    const target = cardRefs.current[expandedId];
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [expandedId]);

  /** Отправка заказа в таблицу после подтверждения страхового депозита (если требуется). */
  const handleSendToManager = async (
    order: ArchivedOrder,
    isMeasurementPaidCash: boolean,
    hasMeasurementFee = order.includeMeasurementFee === true
  ) => {
    const docId = (order as { firestoreId?: string }).firestoreId || order.archiveId;
    if (!isMountedRef.current) return;
    setSendingToManagerId(docId);
    setSendStatusByDocId(prev => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });
    try {
      const items = Array.isArray(order.items) ? order.items : [];
      const baseMeasurementFee = resolveBaseMeasurementFee(prices);
      let totals;
      let managerTotal: number;
      let measurementDeduction = 0;

      if (hasMeasurementFee) {
        const result = calculateManagerWorkTotal(
          { ...order, items },
          prices,
          isMeasurementPaidCash
        );
        totals = result.totals;
        managerTotal = result.managerTotal;
        measurementDeduction = result.measurementDeduction;
      } else {
        totals = calculateOrderTotals({ ...order, items }, prices);
        managerTotal = totals.grandTotal;
      }

      const storedMeasurementFee = hasMeasurementFee
        ? (totals.measurementFee > 0 ? totals.measurementFee : baseMeasurementFee)
        : 0;

      const payload = {
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
      const payloadStr = JSON.stringify(payload, null, 2);
      (window as Window & { __lastWebhookPayload?: string }).__lastWebhookPayload = payloadStr;

      const existingAck = getSheetAck(order.archiveId);
      if (existingAck) {
        console.warn('[SEND_TO_MANAGER] using existing sheetAck, skipping webhook');
      } else {
        const webhookResponse = await postOrderToGoogleSheet(payload);
        setSheetAck(order.archiveId, webhookResponse);
      }

      const paymentUpdate: ArchiveWorkStatusPaymentUpdate = !hasMeasurementFee
        ? {
            measurementRequired: false,
            measurementPaidCash: false,
            measurementFee: 0,
            grandTotal: totals.grandTotal,
            managerTotal: totals.grandTotal,
            amountDue: totals.grandTotal,
            total: totals.grandTotal,
          }
        : isMeasurementPaidCash
          ? {
              measurementRequired: true,
              measurementPaidCash: true,
              measurementFee: storedMeasurementFee,
              grandTotal: totals.grandTotal,
              managerTotal,
              amountDue: managerTotal,
              total: managerTotal,
            }
          : {
              measurementRequired: true,
              measurementPaidCash: false,
              measurementFee: storedMeasurementFee,
              grandTotal: totals.grandTotal,
              managerTotal: totals.grandTotal,
              amountDue: totals.grandTotal,
              total: totals.grandTotal,
            };

      await setDoc(
        doc(db, 'measurements', order.archiveId),
        {
          workStatus: 'in_production',
          workStatusLabel: WORK_STATUS_LABELS.in_production,
          workStatusUpdatedAt: serverTimestamp(),
          ...paymentUpdate,
        },
        { merge: true }
      );
      clearSheetAck(order.archiveId);
      onWorkStatusUpdated?.(
        order.archiveId,
        'in_production',
        WORK_STATUS_LABELS.in_production,
        paymentUpdate
      );
      if (!isMountedRef.current) return;
      setSendStatusByDocId(prev => ({ ...prev, [docId]: 'success' }));
      setConfirmPaymentOrder(null);
      const t = setTimeout(() => {
        if (isMountedRef.current) {
          setSendStatusByDocId(prev => {
            const next = { ...prev };
            delete next[docId];
            return next;
          });
        }
      }, 5000);
      timeoutIdsRef.current.push(t);
      alert(
        hasMeasurementFee && isMeasurementPaidCash
          ? `Заказ отправлен. Остаток к оплате: ${paymentUpdate.amountDue} ₽`
          : 'Заказ отправлен в работу'
      );
    } catch (e) {
      console.error('[SEND_TO_MANAGER] send to work failed', e);
      const detail = e instanceof Error ? e.message : String(e);
      const hasSheetAck = Boolean(getSheetAck(order.archiveId));
      setSendStatusByDocId(prev => ({ ...prev, [docId]: 'error' }));
      const t = setTimeout(() => {
        if (isMountedRef.current) {
          setSendStatusByDocId(prev => {
            const next = { ...prev };
            delete next[docId];
            return next;
          });
        }
      }, 7000);
      timeoutIdsRef.current.push(t);
      if (hasSheetAck) {
        alert(SHEET_ACK_FIRESTORE_RETRY_MESSAGE);
      } else {
        console.error('Отправка заказа в Google Таблицу:', e);
        alert(`Ошибка отправки в таблицу. Детали: ${detail}`);
      }
    } finally {
      if (isMountedRef.current) setSendingToManagerId(null);
    }
  };

  const attemptDelete = (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    if (confirmDeleteId === docId) {
      onDelete(docId);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(docId);
      const t = setTimeout(() => {
        if (isMountedRef.current) setConfirmDeleteId(prev => prev === docId ? null : prev);
      }, 3000);
      timeoutIdsRef.current.push(t);
    }
  };

  const confirmPaymentDocId = confirmPaymentOrder
    ? ((confirmPaymentOrder as { firestoreId?: string }).firestoreId || confirmPaymentOrder.archiveId)
    : null;
  const isConfirmPaymentSending = confirmPaymentDocId != null && sendingToManagerId === confirmPaymentDocId;

  const renderArchiveQuickActions = (order: ArchivedOrder) => (
    <div className="space-y-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowPaymentQr(true);
        }}
        className="w-full py-3 bg-gray-700 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 hover:bg-gray-800 transition-transform"
      >
        Показать QR для оплаты
      </button>
    </div>
  );

  if (sortedArchive.length === 0) {
    return (
      <div className="p-10 text-center text-gray-400 space-y-4 h-full flex flex-col justify-center items-center">
        <Calendar size={64} className="stroke-1 opacity-20" />
        <p className="text-lg font-medium">Облачный архив пуст</p>
        <p className="text-xs max-w-[200px]">Здесь будут храниться все расчеты, доступные всей команде.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-4 gap-1.5 px-2">
        {ARCHIVE_FILTER_OPTIONS.map((option) => {
          const isActive = archiveFilter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setArchiveFilter(option.id)}
              className={`min-w-0 px-1.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight leading-tight transition-all active:scale-95 ${
                isActive
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between items-center px-2">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
          <Cloud size={14} className="text-blue-400" /> Замеров: {filteredArchive.length}
          {filteredArchive.length !== sortedArchive.length ? ` из ${sortedArchive.length}` : ''}
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className={`p-2.5 rounded-2xl bg-gray-50 text-gray-400 active:scale-90 transition-all ${refreshing ? 'animate-spin text-orange-500' : ''}`}
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {filteredArchive.length === 0 ? (
        <div className="p-10 text-center text-gray-400 space-y-3">
          <Calendar size={48} className="stroke-1 opacity-20 mx-auto" />
          <p className="text-sm font-medium">Нет заказов по выбранному фильтру</p>
        </div>
      ) : (
      filteredArchive.map((order) => {
        const docId = order.firestoreId || order.archiveId;
        const items = Array.isArray(order.items) ? order.items : [];
        const paymentDisplay = resolveArchivePaymentDisplay(order, items, prices);
        const { totals } = paymentDisplay;
        const isExpanded = expandedId === docId;
        const isConfirming = confirmDeleteId === docId;
        const telE164 = phoneE164Russia(order.customer?.phone);
        const paymentBadgeLabel = (order.paymentMethod === 'qr' ? 'QR +8%' : 'Наличные');
        const paymentBadgeClass = order.paymentMethod === 'qr'
          ? 'bg-blue-50 text-blue-600'
          : 'bg-emerald-50 text-emerald-600';
        const workStatus = resolveWorkStatus(order);
        const workStatusClass = workStatus.code === 'ready'
          ? 'bg-green-600 text-white'
          : workStatus.code === 'in_production'
            ? 'bg-yellow-500 text-white'
            : 'bg-gray-500 text-white';
        const sheetRow = order.sheetRow ?? order.googleSheetRow;
        const canSendToManager = !order.workStatus || order.workStatus === 'waiting';

        return (
          <div
            key={docId}
            ref={(el) => {
              cardRefs.current[docId] = el;
            }}
            className={`relative bg-white border rounded-2xl overflow-hidden shadow-sm transition-all duration-300 ${isExpanded ? 'border-orange-400 ring-1 ring-orange-100' : 'border-gray-200'}`}
          >
            <div className={`absolute top-2 right-2 px-2.5 py-1 rounded-md font-bold text-[10px] z-10 ${workStatusClass}`}>
              {workStatus.label}
            </div>
            <div 
              className="p-4 flex justify-between items-center cursor-pointer active:bg-gray-50"
              onClick={() => {
                setExpandedId(isExpanded ? null : docId);
                setConfirmDeleteId(null);
              }}
            >
              <div className="space-y-1 flex-1 pr-2 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md font-bold text-[10px]">
                    <Clock size={12} /> {order.date.split(',')[1]?.trim() || ''}
                  </div>
                  <div className="text-gray-400 font-bold text-[10px] uppercase">
                    {order.date.split(',')[0]}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-gray-800 font-bold text-sm truncate">
                  <User size={14} className="text-gray-300 flex-shrink-0" /> {order.customer?.name || 'Без имени'}
                </div>
                {/* Кликабельный телефон в шапке карточки */}
                {order.customer?.phone ? (
                  <a
                    href={telE164 ? `tel:${telE164}` : '#'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!telE164) e.preventDefault();
                    }}
                    className="inline-flex items-center gap-2 mt-0.5 px-2.5 py-1 rounded-lg bg-orange-50 text-orange-700 font-black tracking-wide text-[13px] max-w-full"
                  >
                    <Phone size={14} className="text-orange-400 flex-shrink-0" />
                    <span className="truncate">{order.customer.phone}</span>
                  </a>
                ) : (
                  <div className="flex items-center gap-2 text-[10px] text-orange-600 font-black tracking-wider truncate">
                    <Phone size={12} className="text-orange-300 flex-shrink-0" /> —
                  </div>
                )}
                <div className="flex items-start gap-2 text-[12px] text-black">
                  <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <span className="whitespace-normal break-words font-medium">{order.customer?.address || 'Адрес не указан'}</span>
                </div>
                {order.customer?.address && (
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openMap(order);
                      }}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-gray-100 rounded-xl text-gray-700 active:bg-gray-200 transition-all"
                    >
                      <IconMapColor size={18} className="shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wide">Карта</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        buildRoute(order);
                      }}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-gray-100 rounded-xl text-gray-700 active:bg-gray-200 transition-all"
                    >
                      <IconRouteColor size={18} className="shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wide">Маршрут</span>
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col items-stretch gap-1.5">
                {(order.hasPendingWrites === true || order.syncStatus === 'pending' || order.syncStatus === 'syncing') && (
                  <div className="w-full bg-[#007AFF] text-white rounded-xl px-2.5 py-1 text-[10px] font-black uppercase tracking-wide whitespace-nowrap">
                    ⏳ Ожидает синхронизации
                  </div>
                )}
                {order.syncStatus === 'error' && (
                  <div className="w-full bg-red-600 text-white rounded-xl px-2.5 py-1 text-[10px] font-black uppercase tracking-wide whitespace-nowrap">
                    Ошибка синхронизации
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide ${paymentBadgeClass}`}>
                      {paymentBadgeLabel}
                    </span>
                    {paymentDisplay.displayMode === 'deposit_paid' ? (
                      <>
                        <span className="text-lg font-black text-orange-900 leading-none">
                          {paymentDisplay.amountDue} ₽
                        </span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide text-right">
                          остаток к оплате
                        </span>
                      </>
                    ) : (
                      <span className="text-lg font-black text-orange-900 leading-none">
                        {paymentDisplay.displayMode === 'default'
                          ? paymentDisplay.displayTotal
                          : paymentDisplay.amountDue}{' '}
                        ₽
                      </span>
                    )}
                  </div>

                  <button 
                    onClick={(e) => attemptDelete(e, docId)}
                    className={`flex items-center justify-center transition-all duration-300 overflow-hidden ${
                      isConfirming 
                      ? 'w-24 bg-red-600 text-white rounded-xl py-2 shadow-inner' 
                      : 'w-10 h-10 bg-red-50 text-red-500 rounded-full hover:bg-red-100'
                    }`}
                  >
                    {isConfirming ? (
                      <span className="text-[10px] font-black uppercase tracking-tighter whitespace-nowrap px-2">Удалить?</span>
                    ) : (
                      <Trash2 size={18} />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-4 bg-gray-50/30">
                <div className="space-y-2">
                  <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">Состав заказа</h4>
                  {items.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic ml-1">
                      {(order as ArchiveOrderWithTotal).items_summary || 'Позиции не указаны'}
                    </p>
                  ) : (
                    splitItemsByQuantity(items).map((item, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm space-y-1">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-gray-800 text-xs">
                          {item.type === ProductType.JALOUSIE_CLASSIC
                            ? 'Портал'
                            : item.type === ProductType.JALOUSIE_COZY
                              ? 'Уют +'
                              : item.type === ProductType.JALOUSIE_LIGHT
                                ? 'Лайт'
                              : item.type}
                        </span>
                        <span className="font-bold text-orange-600 text-xs">{item.price} ₽</span>
                      </div>
                      <div className="text-[10px] text-gray-500 leading-relaxed whitespace-normal break-words">
                        <span>{getArchiveItemDetails(item)}</span>
                      </div>
                      {item.comment && (
                        <div className="mt-1 flex gap-1.5 items-start bg-amber-50/50 p-1.5 rounded border border-amber-100/50">
                          <Info size={10} className="text-amber-500 mt-0.5" />
                          <p className="text-[9px] text-amber-700 italic">{item.comment}</p>
                        </div>
                      )}
                    </div>
                  ))
                  )}
                </div>

                <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm space-y-2">
                   <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Услуги и Итоги</h4>
                   {paymentDisplay.displayMode === 'deposit_paid' ? (
                     <div className="flex justify-between items-start text-xs gap-2">
                       <div className="flex items-start gap-2 text-gray-500 min-w-0">
                         <Info size={12} className="shrink-0 mt-0.5" />
                         <span className="break-words">Страховой депозит: {paymentDisplay.measurementFee} ₽ — получен наличными</span>
                       </div>
                     </div>
                   ) : paymentDisplay.displayMode === 'deposit_included' ? (
                     <div className="flex justify-between items-start text-xs gap-2">
                       <div className="flex items-start gap-2 text-gray-500 min-w-0">
                         <Info size={12} className="shrink-0 mt-0.5" />
                         <span className="break-words">Страховой депозит включён в счёт: {paymentDisplay.measurementFee} ₽</span>
                       </div>
                     </div>
                   ) : paymentDisplay.displayMode === 'default' && totals.includeMeasurementFee ? (
                     <div className="flex justify-between items-center text-xs">
                       <div className="flex items-center gap-2 text-gray-500">
                         <Info size={12} />
                         <span>Страховой депозит:</span>
                       </div>
                       <span className="font-bold text-gray-700">{totals.measurementFee} ₽</span>
                     </div>
                   ) : null}
                   <div className="flex justify-between items-center text-xs">
                     <div className="flex items-center gap-2 text-gray-500"><Truck size={12} /><span>Доставка:</span></div>
                     <span className="font-bold text-gray-700">{totals.deliveryCost} ₽</span>
                   </div>
                   <div className="flex justify-between items-center text-xs">
                     <div className="flex items-center gap-2 text-gray-500"><Hammer size={12} /><span>Монтаж:</span></div>
                     <span className="font-bold text-gray-700">{totals.installTotal} ₽</span>
                   </div>
                   {totals.paymentSurcharge > 0 && (
                     <div className="flex justify-between items-center text-xs">
                       <div className="flex items-center gap-2 text-gray-500">
                         <Info size={12} />
                         <span>Оплата QR/картой (+8%):</span>
                       </div>
                       <span className="font-bold text-gray-700">{totals.paymentSurcharge} ₽</span>
                     </div>
                   )}
                   {order.generalComment && (
                     <div className="pt-2 mt-2 border-t border-gray-50 text-[10px] text-gray-500 italic">
                        <strong>Комментарий:</strong> {order.generalComment}
                      </div>
                   )}
                   <div className="pt-2 mt-2 border-t border-gray-100 space-y-1.5">
                     {paymentDisplay.displayMode === 'deposit_paid' ? (
                       <>
                         <div className="flex justify-between items-center text-xs">
                           <span className="text-gray-500">Общая сумма заказа:</span>
                           <span className="font-bold text-gray-800">{paymentDisplay.grandTotal} ₽</span>
                         </div>
                         <div className="flex justify-between items-center text-xs">
                           <span className="text-gray-500">Страховой депозит уже получен:</span>
                           <span className="font-bold text-gray-800">{paymentDisplay.measurementFee} ₽</span>
                         </div>
                         <div className="flex justify-between items-center text-xs">
                           <span className="text-gray-700 font-bold">Остаток к оплате:</span>
                           <span className="font-black text-orange-900 text-sm">{paymentDisplay.amountDue} ₽</span>
                         </div>
                       </>
                     ) : paymentDisplay.displayMode === 'deposit_included' ? (
                       <>
                         <div className="flex justify-between items-center text-xs">
                           <span className="text-gray-700 font-bold">Итого к оплате:</span>
                           <span className="font-black text-orange-900 text-sm">{paymentDisplay.amountDue} ₽</span>
                         </div>
                         <div className="flex justify-between items-center text-xs">
                           <span className="text-gray-500">Страховой депозит включён в счёт:</span>
                           <span className="font-bold text-gray-800">{paymentDisplay.measurementFee} ₽</span>
                         </div>
                       </>
                     ) : paymentDisplay.displayMode === 'customer_sizes' ? (
                       <>
                         <div className="flex justify-between items-center text-xs">
                           <span className="text-gray-700 font-bold">Итого к оплате:</span>
                           <span className="font-black text-orange-900 text-sm">{paymentDisplay.amountDue} ₽</span>
                         </div>
                         <div className="text-[10px] text-gray-500 font-medium">
                           Размеры предоставлены заказчиком
                         </div>
                       </>
                     ) : (
                       <div className="flex justify-between items-center text-xs">
                         <span className="text-gray-700 font-bold">Итого:</span>
                         <span className="font-black text-orange-900 text-sm">{paymentDisplay.displayTotal} ₽</span>
                       </div>
                     )}
                   </div>
                </div>

                {renderArchiveQuickActions(order)}

                {canSendToManager && (
                  <>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (order.includeMeasurementFee === true) {
                      setConfirmPaymentOrder(order);
                    } else {
                      void handleSendToManager(order, false, false);
                    }
                  }}
                  disabled={sendingToManagerId === docId}
                  className="w-full py-4 bg-[#0088cc] text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 hover:bg-[#007ab8] transition-transform disabled:opacity-70 disabled:pointer-events-none"
                >
                  {sendingToManagerId === docId ? (
                    <>
                      <Loader2 size={18} className="animate-spin shrink-0" />
                      Отправка...
                    </>
                  ) : (
                    <>
                      <Hammer size={18} />
                      Отправить в работу
                    </>
                  )}
                </button>
                {sendStatusByDocId[docId] === 'success' && (
                  <p className="text-[10px] font-bold text-green-600 text-center">Заказ отправлен в таблицу</p>
                )}
                {sendStatusByDocId[docId] === 'error' && (
                  <p className="text-[10px] font-bold text-red-500 text-center">Ошибка отправки в таблицу</p>
                )}
                  </>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onEditArchive(order); }}
                  className="w-full py-3 bg-orange-500 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 hover:bg-orange-600 transition-transform"
                >
                  <Pencil size={16} />
                  Редактировать замер
                </button>
              </div>
            )}
            <div className="px-4 pb-3 pt-2 border-t border-gray-50 space-y-0.5">
              <p className="text-xs text-gray-400 break-all">ID заказа: {order.archiveId}</p>
              {sheetRow != null && String(sheetRow).trim() !== '' && (
                <p className="text-xs text-gray-400">Строка таблицы: {sheetRow}</p>
              )}
            </div>
          </div>
        );
      })
      )}

      {confirmPaymentOrder && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl border border-gray-100 p-5 space-y-4">
            <h3 className="text-lg font-black text-gray-800">Страховой депозит получен наличными?</h3>
            <p className="text-xs text-gray-500">
              Выберите вариант перед отправкой заказа в таблицу.
            </p>

            {isConfirmPaymentSending && (
              <div className="w-full flex items-center justify-center gap-2 bg-blue-50 text-blue-700 rounded-xl py-2 px-3 text-xs font-bold">
                <Loader2 size={14} className="animate-spin shrink-0" />
                Отправляем в таблицу... Пожалуйста, подождите
              </div>
            )}

            <button
              type="button"
              onClick={() => handleSendToManager(confirmPaymentOrder, true, true)}
              disabled={isConfirmPaymentSending}
              className="w-full h-12 bg-green-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 disabled:opacity-70 disabled:pointer-events-none"
            >
              {isConfirmPaymentSending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin shrink-0" />
                  Отправка...
                </span>
              ) : (
                'Страховой депозит получен наличными — 1 000 ₽'
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSendToManager(confirmPaymentOrder, false, true)}
              disabled={isConfirmPaymentSending}
              className="w-full h-12 bg-[#0088cc] text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 disabled:opacity-70 disabled:pointer-events-none"
            >
              {isConfirmPaymentSending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin shrink-0" />
                  Отправка...
                </span>
              ) : (
                'Нет, включить в общий счет'
              )}
            </button>

            <button
              type="button"
              onClick={() => setConfirmPaymentOrder(null)}
              disabled={isConfirmPaymentSending}
              className="w-full h-10 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs uppercase tracking-wider active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {mapPickerOrder && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50" onClick={() => setMapPickerOrder(null)}>
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-gray-600">Открыть карту</span>
              <button type="button" onClick={() => setMapPickerOrder(null)} className="p-2 text-gray-400">
                <X size={20} />
              </button>
            </div>
            <p className="px-4 py-2 text-[11px] text-gray-500 truncate">{mapPickerOrder.customer?.address || 'Адрес не указан'}</p>
            <div className="p-4 space-y-2">
              <button
                type="button"
                onClick={() => openMapInApp('yandex', mapPickerOrder)}
                className="w-full py-4 rounded-2xl bg-[#fc3f3f]/10 text-[#fc3f3f] font-bold text-sm flex items-center justify-center gap-2"
              >
                <Map size={20} /> Яндекс Карты
              </button>
              <button
                type="button"
                onClick={() => openMapInApp('2gis', mapPickerOrder)}
                className="w-full py-4 rounded-2xl bg-[#2e7cf6]/10 text-[#2e7cf6] font-bold text-sm flex items-center justify-center gap-2"
              >
                <Map size={20} /> 2ГИС
              </button>
              <button
                type="button"
                onClick={() => openMapInApp('google', mapPickerOrder)}
                className="w-full py-4 rounded-2xl bg-[#4285f4]/10 text-[#4285f4] font-bold text-sm flex items-center justify-center gap-2"
              >
                <Map size={20} /> Google Карты
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentQr && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowPaymentQr(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl border border-gray-100 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-800">QR для оплаты</h3>
              <button type="button" onClick={() => setShowPaymentQr(false)} className="p-2 text-gray-400">
                <X size={20} />
              </button>
            </div>
            <img src={paymentQrImage} alt="QR для оплаты заказа" className="w-full rounded-2xl border border-gray-100" />
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchiveScreen;
