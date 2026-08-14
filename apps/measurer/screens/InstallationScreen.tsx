import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { AlertCircle, ChevronDown, ChevronUp, Loader2, MapPin, Phone, Truck, Wrench, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../firebase';
import { phoneE164Russia } from '../lib/phone';
import { createSbpQr, type CreateSbpQrResult } from '../lib/tochkaApi';
import { PRICES as DEFAULT_PRICES } from '../constants';
import { ProductType } from '../types';

interface ReadyOrder {
  id: string;
  customerName: string;
  phone: string;
  address: string;
  itemsSummary: string;
  total: number;
  serviceIncome: number | null;
  sourceOrderId?: string;
  includeMeasurementFee: boolean;
  measurementPaidCash: boolean | null;
}

interface MeasurementOrder {
  firestoreId: string;
  archiveId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  deliveryType: 'city' | 'out' | 'pickup';
  deliveryKm: number;
  globalInstall: boolean;
  includeMeasurementFee: boolean;
  items: Array<{
    type?: string;
    quantity?: number;
    installPrice?: number;
    price?: number;
  }>;
}

const TOCHKA_REQUEST_TIMEOUT_MS = 7000;

const BANK_REQUISITES = {
  name: 'ИП Марская Ольга Романовна',
  personalAcc: '40802810520000897621',
  bankName: 'ООО "Банк Точка"',
  bic: '044525104',
  correspAcc: '30101810745374525104',
  payeeInn: '602714837517',
} as const;

const buildGostQrPayload = (totalRub: number): string => {
  const sumInKopecks = Math.max(0, Math.round(totalRub * 100));
  return [
    'ST00012',
    `Name=${BANK_REQUISITES.name}`,
    `PersonalAcc=${BANK_REQUISITES.personalAcc}`,
    `BankName=${BANK_REQUISITES.bankName}`,
    `BIC=${BANK_REQUISITES.bic}`,
    `CorrespAcc=${BANK_REQUISITES.correspAcc}`,
    `PayeeINN=${BANK_REQUISITES.payeeInn}`,
    `Sum=${sumInKopecks}`,
    'Purpose=Оплата заказа',
    '',
  ].join('|');
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), timeoutMs);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

const toStringSafe = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
};

const toNumberSafe = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value
      .replace(/\s+/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
};

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value
      .replace(/\s+/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : undefined;
  }
  return undefined;
};

const pickFirstNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    const num = toNumberOrUndefined(value);
    if (num !== undefined) return num;
  }
  return undefined;
};

const pickFromObject = (obj: Record<string, unknown>, keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = toNumberOrUndefined(obj[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

const mapDocToReadyOrder = (id: string, data: Record<string, unknown>): ReadyOrder => {
  const customerObj =
    data.customer && typeof data.customer === 'object'
      ? (data.customer as Record<string, unknown>)
      : undefined;
  const totalsObj =
    data.totals && typeof data.totals === 'object'
      ? (data.totals as Record<string, unknown>)
      : undefined;
  const servicesObj =
    data.services && typeof data.services === 'object'
      ? (data.services as Record<string, unknown>)
      : undefined;
  const logisticsObj =
    data.logistics && typeof data.logistics === 'object'
      ? (data.logistics as Record<string, unknown>)
      : undefined;

  const customerName = toStringSafe(
    data.customerName ?? data.customer_name ?? customerObj?.name ?? data.name
  );
  const phone = toStringSafe(
    data.phone ?? data.customer_phone ?? customerObj?.phone
  );
  const address = toStringSafe(
    data.address ?? data.customer_address ?? customerObj?.address
  );
  const itemsSummary = toStringSafe(
    data.items_summary ?? data.itemsSummary ?? data.summary
  );
  const total = toNumberSafe(data.total ?? data.total_amount ?? data.amount);
  const deliveryCost = pickFirstNumber(
    data.deliveryCost,
    data.delivery_cost,
    data.delivery,
    data.deliveryRub,
    data.delivery_rub,
    data['Доставка'],
    totalsObj ? pickFromObject(totalsObj, ['delivery', 'deliveryCost', 'delivery_cost', 'deliveryRub', 'Доставка']) : undefined,
    servicesObj ? pickFromObject(servicesObj, ['delivery', 'deliveryCost', 'delivery_cost', 'deliveryRub', 'Доставка']) : undefined,
    logisticsObj ? pickFromObject(logisticsObj, ['delivery', 'deliveryCost', 'delivery_cost', 'deliveryRub', 'Доставка']) : undefined
  );
  const installCost = pickFirstNumber(
    data.totalInstallCost,
    data.total_install_cost,
    data.installCost,
    data.install_cost,
    data.installationCost,
    data.mountingCost,
    data.mounting_cost,
    data.installTotal,
    data.install_total,
    data['Монтаж'],
    totalsObj ? pickFromObject(totalsObj, ['install', 'installCost', 'totalInstallCost', 'installTotal', 'Монтаж']) : undefined,
    servicesObj ? pickFromObject(servicesObj, ['install', 'installCost', 'totalInstallCost', 'installTotal', 'Монтаж']) : undefined
  );
  const measurementCost = pickFirstNumber(
    data.measurement,
    data.measurementFee,
    data.measurement_fee,
    data.withMeasurement,
    data.measurementRub,
    data.measurement_rub,
    data['Замер'],
    totalsObj ? pickFromObject(totalsObj, ['measurement', 'measurementFee', 'measurement_fee', 'withMeasurement', 'Замер']) : undefined,
    servicesObj ? pickFromObject(servicesObj, ['measurement', 'measurementFee', 'measurement_fee', 'withMeasurement', 'Замер']) : undefined
  );
  const includeMeasurementFee =
    data.includeMeasurementFee === true ||
    data.include_measurement_fee === true ||
    (totalsObj?.includeMeasurementFee === true) ||
    (totalsObj?.include_measurement_fee === true);
  const measurementPaidCash =
    data.measurementPaidCash === true ||
    data.isMeasurementPaidCash === true ||
    data.measurement_paid_cash === true ||
    data.measurementAlreadyPaid === true ||
    data.measurement_paid === true;
  const hasMeasurementPaidCashFlag =
    data.measurementPaidCash !== undefined ||
    data.isMeasurementPaidCash !== undefined ||
    data.measurement_paid_cash !== undefined ||
    data.measurementAlreadyPaid !== undefined ||
    data.measurement_paid !== undefined;

  const includeMeasurementInIncome =
    measurementCost !== undefined && measurementCost > 0 && includeMeasurementFee && !measurementPaidCash;

  const directIncomeKnown = deliveryCost !== undefined || installCost !== undefined;
  let serviceIncome: number | null = null;
  if (directIncomeKnown) {
    serviceIncome = (deliveryCost ?? 0) + (installCost ?? 0) + (includeMeasurementInIncome ? measurementCost! : 0);
  } else {
    const itemsBase = pickFirstNumber(
      data.itemsBase,
      data.items_base,
      data.productsTotal,
      data.products_total,
      data.itemsTotal,
      data.items_total,
      data.goodsTotal,
      data.goods_total,
      totalsObj ? pickFromObject(totalsObj, ['itemsBase', 'items_base', 'productsTotal', 'itemsTotal']) : undefined
    );
    if (itemsBase !== undefined) {
      serviceIncome = Math.max(0, total - itemsBase);
    }
  }

  const sourceOrderId = toStringSafe(
    data.orderID ?? data.orderId ?? data.archiveId ?? data.measurementId
  );

  return {
    id,
    customerName,
    phone,
    address,
    itemsSummary,
    total,
    serviceIncome,
    sourceOrderId: sourceOrderId || undefined,
    includeMeasurementFee,
    measurementPaidCash: hasMeasurementPaidCashFlag ? measurementPaidCash : null,
  };
};

const normalizePhone = (raw: string): string => raw.replace(/\D/g, '').slice(-10);
const normalizeText = (raw: string): string => raw.trim().toLowerCase();
const buildMatchKey = (name: string, phone: string, address: string): string =>
  `${normalizeText(name)}|${normalizePhone(phone)}|${normalizeText(address)}`;

const toMeasurementOrder = (id: string, data: Record<string, unknown>): MeasurementOrder => {
  const customerObj =
    data.customer && typeof data.customer === 'object'
      ? (data.customer as Record<string, unknown>)
      : undefined;
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems.map((it) => {
    const item = (it && typeof it === 'object') ? (it as Record<string, unknown>) : {};
    return {
      type: toStringSafe(item.type),
      quantity: toNumberOrUndefined(item.quantity) ?? 1,
      installPrice: toNumberOrUndefined(item.installPrice) ?? 0,
      price: toNumberOrUndefined(item.price) ?? 0,
    };
  });

  const deliveryTypeRaw = toStringSafe(data.deliveryType);
  const deliveryType: 'city' | 'out' | 'pickup' =
    deliveryTypeRaw === 'out' || deliveryTypeRaw === 'pickup' ? deliveryTypeRaw : 'city';

  return {
    firestoreId: id,
    archiveId: toStringSafe(data.archiveId) || undefined,
    customerName: toStringSafe(customerObj?.name ?? data.customerName ?? data.name),
    customerPhone: toStringSafe(customerObj?.phone ?? data.phone),
    customerAddress: toStringSafe(customerObj?.address ?? data.address),
    deliveryType,
    deliveryKm: toNumberOrUndefined(data.deliveryKm) ?? 0,
    globalInstall: data.globalInstall !== false,
    includeMeasurementFee: data.includeMeasurementFee === true,
    items,
  };
};

const calculateServiceIncomeFromMeasurement = (
  measurement: MeasurementOrder,
  readyOrderTotal: number,
  measurementPaidCash: boolean | null
): number => {
  let installTotal = 0;
  const itemsBase = measurement.items.reduce((sum, item) => sum + (item.price || 0), 0);
  if (measurement.globalInstall) {
    const totalQty = measurement.items.reduce((sum, item) => sum + Math.max(1, item.quantity || 1), 0);
    if (totalQty === 1 && measurement.items.length > 0) {
      const item = measurement.items[0];
      if (item.type === ProductType.FRAME || item.type === ProductType.WING) {
        installTotal = 900;
      } else {
        installTotal = item.installPrice || 0;
      }
    } else {
      installTotal = measurement.items.reduce((sum, item) => {
        const qty = Math.max(1, item.quantity || 1);
        if (item.type === ProductType.FRAME || item.type === ProductType.WING) {
          return sum + (500 * qty);
        }
        return sum + (item.installPrice || 0);
      }, 0);
    }
  }

  let delivery = 0;
  if (measurement.deliveryType === 'city') {
    delivery = DEFAULT_PRICES.price_settings.logistics.delivery_base;
  } else if (measurement.deliveryType === 'out') {
    delivery =
      DEFAULT_PRICES.price_settings.logistics.delivery_base +
      (measurement.deliveryKm * DEFAULT_PRICES.price_settings.logistics.delivery_km);
  }

  const measurementFee = DEFAULT_PRICES.price_settings.logistics.measurement_fee ?? 1000;
  const totalWithoutMeasurement = itemsBase + installTotal + delivery;
  const totalWithMeasurement =
    totalWithoutMeasurement + (measurement.includeMeasurementFee ? measurementFee : 0);

  let includeMeasurement = false;
  if (measurement.includeMeasurementFee) {
    if (measurementPaidCash === true) {
      includeMeasurement = false;
    } else if (measurementPaidCash === false) {
      includeMeasurement = true;
    } else {
      // Флаг из ready_orders не пришел: определяем по фактической сумме заказа.
      // Если итог ближе к "без замера", значит замер уже оплачен на руки.
      const diffWithout = Math.abs(readyOrderTotal - totalWithoutMeasurement);
      const diffWith = Math.abs(readyOrderTotal - totalWithMeasurement);
      includeMeasurement = diffWith < diffWithout;
    }
  }

  return Math.max(0, installTotal + delivery + (includeMeasurement ? measurementFee : 0));
};

const InstallationScreen: React.FC = () => {
  const [orders, setOrders] = useState<ReadyOrder[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentOrder, setPaymentOrder] = useState<ReadyOrder | null>(null);
  const [qrResult, setQrResult] = useState<CreateSbpQrResult | null>(null);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [qrError, setQrError] = useState<string>('');
  const [isGostFallback, setIsGostFallback] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  useEffect(() => {
    // Подписка без фильтров/сортировок: показываем все документы из ready_orders.
    const q = query(collection(db, 'ready_orders'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs.map((d) => mapDocToReadyOrder(d.id, d.data() as Record<string, unknown>));
        console.log('Fetched orders:', next);
        setOrders(next);
        setIsLoading(false);
      },
      (error) => {
        console.error('ready_orders snapshot error:', error);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'measurements'));
    const unsub = onSnapshot(q, (snapshot) => {
      const next = snapshot.docs.map((d) => toMeasurementOrder(d.id, d.data() as Record<string, unknown>));
      setMeasurements(next);
    });
    return () => unsub();
  }, []);

  const ordersWithIncome = useMemo(() => {
    if (orders.length === 0) return orders;

    const byArchiveId = new Map<string, MeasurementOrder>();
    const byMatchKey = new Map<string, MeasurementOrder>();
    for (const m of measurements) {
      if (m.archiveId) byArchiveId.set(m.archiveId, m);
      byMatchKey.set(buildMatchKey(m.customerName, m.customerPhone, m.customerAddress), m);
    }

    return orders.map((order) => {
      if (order.serviceIncome != null) return order;

      const fromArchiveId = order.sourceOrderId ? byArchiveId.get(order.sourceOrderId) : undefined;
      const fromKey = byMatchKey.get(buildMatchKey(order.customerName, order.phone, order.address));
      const linked = fromArchiveId || fromKey;
      if (!linked) return order;

      const serviceIncome = calculateServiceIncomeFromMeasurement(
        linked,
        order.total,
        order.measurementPaidCash
      );
      return { ...order, serviceIncome };
    });
  }, [orders, measurements]);

  const hasOrders = useMemo(() => ordersWithIncome.length > 0, [ordersWithIncome]);
  const paymentPayload = useMemo(() => {
    if (!qrResult) return '';
    return qrResult.paymentUrl || qrResult.qrPayload || '';
  }, [qrResult]);
  const gostFallbackPayload = useMemo(() => {
    if (!paymentOrder) return '';
    return buildGostQrPayload(Math.max(0, Math.round(paymentOrder.total)));
  }, [paymentOrder]);
  const paymentMode = useMemo<'online' | 'offline' | 'pending' | 'error'>(() => {
    if (isLoadingQr) return 'pending';
    if (isGostFallback) return 'offline';
    if (qrError) return 'error';
    return 'online';
  }, [isLoadingQr, isGostFallback, qrError]);

  const openPhone = (raw: string) => {
    const tel = phoneE164Russia(raw);
    if (!tel) return;
    window.location.href = `tel:${tel}`;
  };

  const openRoute = (address: string) => {
    if (!address) return;
    const url = `https://yandex.ru/maps/?rtext=~${encodeURIComponent(address)}&rtt=auto`;
    window.open(url, '_blank');
  };

  const requestQr = async (order: ReadyOrder) => {
    setIsLoadingQr(true);
    setQrError('');
    setIsGostFallback(false);
    try {
      // На этом экране берём сумму из заказа монтажа как финальную к оплате.
      const finalSum = Math.max(0, Math.round(order.total));
      const result = await withTimeout(
        createSbpQr(finalSum, order.id, order.itemsSummary || `Оплата заказа ${order.id}`),
        TOCHKA_REQUEST_TIMEOUT_MS
      );
      setQrResult(result);
      if (!result.paymentUrl && !result.qrPayload && !result.qrImageBase64) {
        throw new Error('API не вернуло ссылку/данные QR. Проверьте endpoint и формат ответа.');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось получить QR из API Точка';
      const networkLikeError =
        !navigator.onLine ||
        /failed to fetch|networkerror|network error|request_timeout|timeout|aborted/i.test(message);

      if (networkLikeError) {
        setQrError('Нет сети. Показан статический QR-код для ручной оплаты.');
        setQrResult(null);
        setIsGostFallback(true);
      } else {
        setQrError(message);
        setQrResult(null);
      }
    } finally {
      setIsLoadingQr(false);
    }
  };

  useEffect(() => {
    if (!paymentOrder) {
      setQrError('');
      setQrResult(null);
      setIsGostFallback(false);
      setIsLoadingQr(false);
      return;
    }
    requestQr(paymentOrder);
  }, [paymentOrder]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="text-[11px] font-black uppercase tracking-widest text-gray-400">Загрузка монтажей...</div>
      </div>
    );
  }

  if (!hasOrders) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 text-center gap-4">
        <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm max-w-xs">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-orange-50 text-[#f39200] flex items-center justify-center">
            <Truck size={28} />
          </div>
          <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight">Список монтажей</h2>
          <p className="text-sm text-gray-400 mt-2 font-medium">Готовых заказов пока нет</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 space-y-4 bg-gray-50">
        {ordersWithIncome.map((order) => (
          <div key={order.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Адрес</p>
                <h3 className="text-sm font-black text-gray-800 break-words">📍 {order.address || 'Адрес не указан'}</h3>
              </div>
              <div className="flex items-start gap-2 shrink-0">
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">К оплате</p>
                  <p className="text-lg font-black text-[#f39200] leading-none">{Math.round(order.total)} ₽</p>
                  <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-1">Монтаж+доставка</p>
                  <p className="text-xs font-black text-blue-700 leading-none">
                    {order.serviceIncome == null ? '—' : `${Math.round(order.serviceIncome)} ₽`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedOrderId((prev) => (prev === order.id ? null : order.id))}
                  className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                  aria-label={expandedOrderId === order.id ? 'Свернуть заказ' : 'Развернуть заказ'}
                >
                  {expandedOrderId === order.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            </div>

            {expandedOrderId === order.id && (
              <div className="space-y-3 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Клиент</p>
                  <p className="text-sm font-bold text-gray-800 break-words">👤 {order.customerName || 'Без имени'}</p>
                </div>

                <button
                  type="button"
                  onClick={() => openPhone(order.phone)}
                  className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
                >
                  <Phone size={16} className="shrink-0" />
                  <span className="text-sm font-bold break-all">📞 {order.phone || '—'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => openRoute(order.address)}
                  className="w-full flex items-start gap-2 text-left px-3 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <MapPin size={16} className="shrink-0 mt-0.5" />
                  <span className="text-sm font-bold whitespace-normal break-words">📍 {order.address || 'Адрес не указан'}</span>
                </button>

                <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Состав заказа</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">📦 {order.itemsSummary || '—'}</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentOrder(order);
                  }}
                  className="w-full h-11 bg-[#f39200] text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95"
                >
                  <Wrench size={16} className="shrink-0" />
                  К ОПЛАТЕ
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {paymentOrder && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-black text-gray-800">Оплата заказа</h3>
              <button
                type="button"
                onClick={() => setPaymentOrder(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-3">
              {paymentMode === 'online' && (
                <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider">
                  СБП (онлайн)
                </div>
              )}
              {paymentMode === 'offline' && (
                <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider">
                  ГОСТ (офлайн)
                </div>
              )}
              {paymentMode === 'pending' && (
                <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider">
                  Получаем СБП QR...
                </div>
              )}
              {paymentMode === 'error' && (
                <div className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider">
                  Ошибка получения QR
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-3 flex justify-center min-h-[274px] items-center">
              {isLoadingQr && (
                <div className="text-center space-y-2">
                  <Loader2 size={28} className="animate-spin mx-auto text-[#f39200]" />
                  <p className="text-xs font-bold text-gray-500">Генерируем QR в Точка Банк...</p>
                </div>
              )}

              {!isLoadingQr && isGostFallback && gostFallbackPayload && (
                <div className="text-center space-y-3 max-w-[260px]">
                  <div className="w-full rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                    <p className="text-xs font-bold text-amber-700 break-words">{qrError}</p>
                  </div>
                  <QRCodeSVG
                    value={gostFallbackPayload}
                    size={250}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="M"
                    includeMargin
                  />
                  <button
                    type="button"
                    onClick={() => paymentOrder && requestQr(paymentOrder)}
                    className="h-9 px-4 bg-amber-500 text-white rounded-lg text-xs font-black uppercase tracking-wide active:scale-95"
                  >
                    Повторить запрос
                  </button>
                </div>
              )}

              {!isLoadingQr && !isGostFallback && qrError && (
                <div className="text-center space-y-3 max-w-[240px]">
                  <AlertCircle size={26} className="mx-auto text-red-500" />
                  <p className="text-xs font-bold text-red-600 break-words">{qrError}</p>
                  <button
                    type="button"
                    onClick={() => paymentOrder && requestQr(paymentOrder)}
                    className="h-9 px-4 bg-red-500 text-white rounded-lg text-xs font-black uppercase tracking-wide active:scale-95"
                  >
                    Повторить запрос
                  </button>
                </div>
              )}

              {!isLoadingQr && !qrError && !isGostFallback && qrResult?.qrImageBase64 && (
                <img
                  src={`data:image/png;base64,${qrResult.qrImageBase64}`}
                  alt="QR для оплаты СБП"
                  className="w-[250px] h-[250px] object-contain bg-white"
                />
              )}

              {!isLoadingQr && !qrError && !isGostFallback && !qrResult?.qrImageBase64 && paymentPayload && (
                <QRCodeSVG
                  value={paymentPayload}
                  size={250}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                  includeMargin
                />
              )}
            </div>

            <p className="mt-4 text-center text-2xl font-black text-[#f39200]">
              {Math.round(paymentOrder.total)} ₽
            </p>

            <button
              type="button"
              onClick={() => setPaymentOrder(null)}
              className="mt-4 w-full h-11 bg-gray-700 text-white rounded-xl font-black text-xs uppercase tracking-widest active:scale-95"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallationScreen;
