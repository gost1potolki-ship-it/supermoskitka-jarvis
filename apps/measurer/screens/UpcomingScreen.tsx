import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, doc, getDocsFromCache, getDocsFromServer, onSnapshot, orderBy, query, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UpcomingMeasurement, DATABASE_MAPPING, UserRole, UpcomingReservationStatus } from '../types';
import { phoneE164Russia } from '../lib/phone';
import IconMapColor from '../components/IconMapColor';
import IconRouteColor from '../components/IconRouteColor';
import {
  Phone,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  MapPin,
  Map,
  MessageSquare,
  Clock,
  Building2,
  Banknote,
  X,
  Timer
} from 'lucide-react';
/* Откат кастомных иконок карты/маршрута: удалить импорты IconMapColor, IconRouteColor;
   в кнопках «Карта» и «Маршрут» вернуть <MapPin size={26} ... /> и <Route size={26} ... /> из lucide-react. */

interface UpcomingScreenProps {
  onStartWork?: (
    customer: { name: string; phone: string; address: string },
    comment?: string,
    upcomingId?: string
  ) => void;
  measurerUid: string;
  measurerDisplayName: string;
  measurerRole?: UserRole;
}

const UPCOMING_RESERVATION_STATUSES: UpcomingReservationStatus[] = [
  'available',
  'reserved',
  'completed',
  'cancelled',
];

const parseReservationStatus = (value: unknown): UpcomingReservationStatus | undefined => {
  if (typeof value === 'string' && UPCOMING_RESERVATION_STATUSES.includes(value as UpcomingReservationStatus)) {
    return value as UpcomingReservationStatus;
  }
  return undefined;
};

const parseUpcomingSource = (value: unknown): 'crm' | 'legacy_sheet' | undefined =>
  value === 'crm' || value === 'legacy_sheet' ? value : undefined;

type UpcomingTab = 'pool' | 'mine';

const isHiddenUpcoming = (m: UpcomingMeasurement): boolean =>
  m.reservationStatus === 'completed' || m.reservationStatus === 'cancelled';

const isGeneralPoolMeasurement = (m: UpcomingMeasurement): boolean => {
  if (isHiddenUpcoming(m)) return false;
  if (m.reservationStatus === 'reserved') return false;
  if (m.reservedByMeasurerId) return false;
  return m.reservationStatus == null || m.reservationStatus === 'available';
};

const isMineMeasurement = (m: UpcomingMeasurement, measurerUid: string): boolean =>
  m.reservedByMeasurerId === measurerUid && m.reservationStatus === 'reserved';

const CANCEL_REASON = 'Клиент отказался / не актуально';

const parseScheduledAt = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return undefined;
};

const toDatetimeLocalValue = (value?: string): string => {
  if (!value?.trim()) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(0, 16);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatScheduledAtDisplay = (value?: string): string | null => {
  if (!value?.trim()) return null;
  const local = toDatetimeLocalValue(value);
  if (local) {
    const d = new Date(local);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }
  return value;
};

/**
 * SECURE DATA ADAPTER
 * Использует DATABASE_MAPPING для конвертации сырых данных из Firebase в типизированный объект
 */
const normalizeMeasurement = (doc: any): UpcomingMeasurement => {
  const data = doc.data ? doc.data() : doc;
  const id = doc.id || data.id || Math.random().toString();

  const get = (keys: readonly string[]) => {
    for (const k of keys) {
      const foundKey = Object.keys(data).find(dk => dk.toLowerCase() === k.toLowerCase());
      if (foundKey && data[foundKey]) return data[foundKey];
    }
    return '';
  };

  const payerVal = String(get(DATABASE_MAPPING.payer)).toLowerCase();
  const isCompany = payerVal.includes('фирма') || payerVal.includes('офис') || payerVal.includes('безнал');
  const reservationStatus = parseReservationStatus(data.reservationStatus);
  const source = parseUpcomingSource(data.source);
  const scheduledAt = parseScheduledAt(data.scheduledAt);

  return {
    id,
    address: get(DATABASE_MAPPING.address),
    apartment: get(DATABASE_MAPPING.apartment),
    customerName: get(DATABASE_MAPPING.customerName),
    phone: get(DATABASE_MAPPING.phone),
    comment: get(DATABASE_MAPPING.comment),
    price: parseFloat(get(DATABASE_MAPPING.price)) || 0,
    payerType: isCompany ? 'company' : 'customer',
    time: get(DATABASE_MAPPING.time),
    coordinates: data.lat ? { lat: data.lat, lon: data.lon || data.long } : undefined,
    ...(reservationStatus != null ? { reservationStatus } : {}),
    ...(data.reservedAt != null ? { reservedAt: data.reservedAt } : {}),
    ...(data.reservedByMeasurerId != null ? { reservedByMeasurerId: data.reservedByMeasurerId } : {}),
    ...(typeof data.reservedByMeasurerName === 'string' && data.reservedByMeasurerName
      ? { reservedByMeasurerName: data.reservedByMeasurerName }
      : {}),
    ...(data.completedAt != null ? { completedAt: data.completedAt } : {}),
    ...(typeof data.completedByMeasurerId === 'string' && data.completedByMeasurerId
      ? { completedByMeasurerId: data.completedByMeasurerId }
      : {}),
    ...(typeof data.archiveId === 'string' && data.archiveId ? { archiveId: data.archiveId } : {}),
    ...(data.cancelledAt != null ? { cancelledAt: data.cancelledAt } : {}),
    ...(typeof data.cancelledByMeasurerId === 'string' && data.cancelledByMeasurerId
      ? { cancelledByMeasurerId: data.cancelledByMeasurerId }
      : {}),
    ...(typeof data.cancelledByMeasurerName === 'string' && data.cancelledByMeasurerName
      ? { cancelledByMeasurerName: data.cancelledByMeasurerName }
      : {}),
    ...(typeof data.cancelReason === 'string' && data.cancelReason ? { cancelReason: data.cancelReason } : {}),
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(typeof data.measurerNote === 'string' && data.measurerNote.trim()
      ? { measurerNote: data.measurerNote.trim() }
      : {}),
    ...(data.measurerNoteUpdatedAt != null ? { measurerNoteUpdatedAt: data.measurerNoteUpdatedAt } : {}),
    ...(typeof data.measurerNoteUpdatedBy === 'string' && data.measurerNoteUpdatedBy
      ? { measurerNoteUpdatedBy: data.measurerNoteUpdatedBy }
      : {}),
    ...(source ? { source } : {}),
  };
};

const UpcomingScreen: React.FC<UpcomingScreenProps> = ({
  onStartWork,
  measurerUid,
  measurerDisplayName,
  measurerRole: _measurerRole,
}) => {
  const [measurements, setMeasurements] = useState<UpcomingMeasurement[]>([]);
  const [activeTab, setActiveTab] = useState<UpcomingTab>('pool');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subscriptionRetryKey, setSubscriptionRetryKey] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mapPickerMeasurement, setMapPickerMeasurement] = useState<UpcomingMeasurement | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [scheduleEditorId, setScheduleEditorId] = useState<string | null>(null);
  const [draftScheduledAt, setDraftScheduledAt] = useState('');
  const [draftMeasurerNote, setDraftMeasurerNote] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  const isMountedRef = useRef(true);

  const upcomingQuery = query(collection(db, 'upcoming_measurements'), orderBy('address', 'asc'));

  const generalMeasurements = useMemo(
    () => measurements.filter(isGeneralPoolMeasurement),
    [measurements]
  );

  const myMeasurements = useMemo(
    () => measurements.filter((m) => isMineMeasurement(m, measurerUid)),
    [measurements, measurerUid]
  );

  const visibleMeasurements = activeTab === 'pool' ? generalMeasurements : myMeasurements;

  const applyMeasurementsSnapshot = (data: UpcomingMeasurement[]) => {
    setMeasurements(data);
    localStorage.setItem('measurer_upcoming_ids', JSON.stringify(data.map(m => ({ id: m.id, address: m.address }))));
  };

  const load = async () => {
    if (!isMountedRef.current) return;
    setLoadError(null);
    setRefreshing(true);
    try {
      const snapshot = await getDocsFromServer(upcomingQuery);
      if (!isMountedRef.current) return;
      applyMeasurementsSnapshot(snapshot.docs.map(normalizeMeasurement));
    } catch (err) {
      console.error('Firebase Sync Error:', err);
      if (isMountedRef.current) {
        try {
          const cachedSnapshot = await getDocsFromCache(upcomingQuery);
          if (!isMountedRef.current) return;
          const data = cachedSnapshot.docs.map(normalizeMeasurement);
          applyMeasurementsSnapshot(data);
          if (data.length === 0) {
            setLoadError('Не удалось загрузить данные. Проверьте подключение к сети.');
          }
        } catch (cacheErr) {
          console.error('Firebase Cache Error:', cacheErr);
          if (isMountedRef.current) {
            setLoadError('Не удалось загрузить данные. Проверьте подключение к сети.');
          }
        }
      }
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  };

  const retryRealtimeSubscription = () => {
    console.log('[UPCOMING] restarting realtime subscription');
    setLoadError(null);
    setLoading(true);
    setSubscriptionRetryKey((v) => v + 1);
  };

  useEffect(() => {
    isMountedRef.current = true;

    const unsubscribe = onSnapshot(
      upcomingQuery,
      (snapshot) => {
        console.log('[UPCOMING] realtime snapshot', snapshot.size);
        if (!isMountedRef.current) return;
        applyMeasurementsSnapshot(snapshot.docs.map(normalizeMeasurement));
        setLoadError(null);
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        console.error('[UPCOMING] onSnapshot error', error);
        if (!isMountedRef.current) return;
        setLoadError('Не удалось загрузить данные. Проверьте подключение к сети.');
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [subscriptionRetryKey]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const reserveMeasurement = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const ref = doc(db, 'upcoming_measurements', id);

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error('NOT_FOUND');

        const data = snap.data();
        if (data?.reservationStatus === 'reserved' || data?.reservedByMeasurerId) {
          throw new Error('ALREADY_RESERVED');
        }

        transaction.update(ref, {
          reservationStatus: 'reserved',
          reservedAt: serverTimestamp(),
          reservedByMeasurerId: measurerUid,
          reservedByMeasurerName: measurerDisplayName,
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'ALREADY_RESERVED') {
        alert('Этот замер уже забронирован.');
        return;
      }
      console.error('[UPCOMING] reserveMeasurement error', err);
      alert('Не удалось забронировать замер. Проверьте интернет и попробуйте ещё раз.');
    }
  };

  const releaseReservation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const measurement = measurements.find((m) => m.id === id);
    if (measurement?.reservedByMeasurerId !== measurerUid) {
      alert('Снять бронь может только замерщик, который забронировал этот замер.');
      return;
    }

    if (!window.confirm('Снять бронь с этого замера?')) return;

    const ref = doc(db, 'upcoming_measurements', id);

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error('NOT_FOUND');

        const data = snap.data();
        if (data?.reservedByMeasurerId !== measurerUid) {
          throw new Error('NOT_OWNER');
        }

        transaction.update(ref, {
          reservationStatus: null,
          reservedAt: null,
          reservedByMeasurerId: null,
          reservedByMeasurerName: null,
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'NOT_OWNER') {
        alert('Снять бронь может только замерщик, который забронировал этот замер.');
        return;
      }
      console.error('[UPCOMING] releaseReservation error', err);
      alert('Не удалось снять бронь. Проверьте интернет и попробуйте ещё раз.');
    }
  };

  const requestCancelMeasurement = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const measurement = measurements.find((m) => m.id === id);
    if (measurement?.reservedByMeasurerId !== measurerUid || measurement?.reservationStatus !== 'reserved') {
      return;
    }
    setCancelConfirmId(id);
  };

  const executeCancelMeasurement = async () => {
    if (!cancelConfirmId || cancelling) return;

    const id = cancelConfirmId;
    const measurement = measurements.find((m) => m.id === id);
    if (measurement?.reservedByMeasurerId !== measurerUid || measurement?.reservationStatus !== 'reserved') {
      setCancelConfirmId(null);
      return;
    }

    const ref = doc(db, 'upcoming_measurements', id);
    setCancelling(true);

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error('NOT_FOUND');

        const data = snap.data();
        if (data?.reservedByMeasurerId !== measurerUid || data?.reservationStatus !== 'reserved') {
          throw new Error('NOT_CANCELABLE');
        }

        transaction.update(ref, {
          reservationStatus: 'cancelled',
          cancelledAt: serverTimestamp(),
          cancelledByMeasurerId: measurerUid,
          cancelledByMeasurerName: measurerDisplayName,
          cancelReason: CANCEL_REASON,
        });
      });
      setCancelConfirmId(null);
    } catch (err) {
      if (err instanceof Error && err.message === 'NOT_CANCELABLE') {
        alert('Не удалось отменить замер: заявка уже изменилась.');
        setCancelConfirmId(null);
        return;
      }
      console.error('[UPCOMING] cancelMeasurement error', err);
      alert('Не удалось отменить замер. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setCancelling(false);
    }
  };

  const openScheduleEditor = (e: React.MouseEvent, m: UpcomingMeasurement) => {
    e.stopPropagation();
    if (m.reservedByMeasurerId !== measurerUid || m.reservationStatus !== 'reserved') return;
    setScheduleEditorId(m.id);
    setDraftScheduledAt(toDatetimeLocalValue(m.scheduledAt));
    setDraftMeasurerNote(m.measurerNote ?? '');
  };

  const closeScheduleEditor = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (savingSchedule) return;
    setScheduleEditorId(null);
    setDraftScheduledAt('');
    setDraftMeasurerNote('');
  };

  const saveMeasurerSchedule = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const measurement = measurements.find((m) => m.id === id);
    if (
      !measurement ||
      measurement.reservedByMeasurerId !== measurerUid ||
      measurement.reservationStatus !== 'reserved'
    ) {
      return;
    }

    setSavingSchedule(true);
    try {
      const scheduledAt = draftScheduledAt.trim();
      const measurerNote = draftMeasurerNote.trim();
      await updateDoc(doc(db, 'upcoming_measurements', id), {
        scheduledAt: scheduledAt || null,
        measurerNote: measurerNote || null,
        measurerNoteUpdatedAt: serverTimestamp(),
        measurerNoteUpdatedBy: measurerUid,
      });
      setScheduleEditorId(null);
      setDraftScheduledAt('');
      setDraftMeasurerNote('');
    } catch (err) {
      console.error('[UPCOMING] saveMeasurerSchedule error', err);
      alert('Не удалось сохранить дату и комментарий. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const ZOOM_100M = 18;

  const normalizeAddressForSearch = (addr: string) => {
    const s = addr.trim();
    return !s.toLowerCase().includes('санкт-петербург') ? `СПб, ${s}` : s;
  };

  const openMap = (m: UpcomingMeasurement) => {
    const search = normalizeAddressForSearch(m.address);
    if (m.coordinates) {
      const { lat, lon } = m.coordinates;
      const geo = `geo:${lat},${lon}?z=${ZOOM_100M}`;
      window.location.href = geo;
      return;
    }
    setMapPickerMeasurement(m);
  };

  const openMapInApp = (app: 'yandex' | '2gis' | 'google', m: UpcomingMeasurement) => {
    const search = normalizeAddressForSearch(m.address);
    const encoded = encodeURIComponent(search);
    const urls: Record<string, string> = {
      yandex: `https://yandex.ru/maps/?text=${encoded}&z=${ZOOM_100M}`,
      '2gis': `https://2gis.ru/search?query=${encoded}`,
      google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    };
    window.open(urls[app], '_blank');
    setMapPickerMeasurement(null);
  };

  const buildRoute = (m: UpcomingMeasurement) => {
    const search = normalizeAddressForSearch(m.address);
    const deepLink = m.coordinates 
      ? `yandexnavi://build_route_on_map?lat_to=${m.coordinates.lat}&lon_to=${m.coordinates.lon}`
      : `yandexnavi://map_search?text=${encodeURIComponent(search)}`;
    window.location.href = deepLink;
    setTimeout(() => { if (!document.hidden) window.open(`https://yandex.ru/maps/?text=${encodeURIComponent(search)}&mode=routes`, '_blank'); }, 1500);
  };

  if (loading && !loadError) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-orange-500 mb-4" size={40} />
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Синхронизация облака...</p>
    </div>
  );

  if (loadError) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
      <p className="text-sm text-red-600 font-medium mb-4">{loadError}</p>
      <button type="button" onClick={retryRealtimeSubscription} className="py-3 px-6 rounded-2xl bg-orange-500 text-white font-bold text-sm active:scale-95">
        Повторить
      </button>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-gray-100 overflow-y-auto pb-24">
      {/* HEADER */}
      <div className="p-4 flex justify-between items-center bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500 p-2.5 rounded-2xl text-white shadow-lg shadow-orange-100">
            <MapPin size={22} />
          </div>
          <div>
            <h2 className="text-[12px] font-black uppercase tracking-widest text-gray-800">Замеры</h2>
            <p className="text-[10px] text-gray-400 font-bold">
              {activeTab === 'pool'
                ? `${generalMeasurements.length} свободных`
                : `${myMeasurements.length} моих`}
            </p>
          </div>
        </div>
        <button onClick={load} className={`p-2.5 rounded-2xl bg-gray-50 text-gray-400 active:scale-90 transition-all ${refreshing ? 'animate-spin text-orange-500' : ''}`}>
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="px-3 pt-3 pb-2 bg-white border-b sticky top-[73px] z-20">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('pool')}
            className={`py-3 px-2 rounded-2xl text-[10px] font-black uppercase tracking-wide transition-all ${
              activeTab === 'pool'
                ? 'bg-[#f39200] text-white shadow-md shadow-orange-100'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            Общие замеры ({generalMeasurements.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mine')}
            className={`py-3 px-2 rounded-2xl text-[10px] font-black uppercase tracking-wide transition-all ${
              activeTab === 'mine'
                ? 'bg-[#f39200] text-white shadow-md shadow-orange-100'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            Мои замеры ({myMeasurements.length})
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {visibleMeasurements.length === 0 && (
          <div className="bg-white rounded-[32px] p-8 text-center shadow-sm">
            <p className="text-sm font-bold text-gray-500">
              {activeTab === 'pool' ? 'Нет свободных заявок' : 'У вас нет забронированных замеров'}
            </p>
          </div>
        )}

        {visibleMeasurements.map((m) => {
          const isExp = expandedId === m.id;
          const telE164 = phoneE164Russia(m.phone);
          const scheduledDisplay = formatScheduledAtDisplay(m.scheduledAt);
          const canEditSchedule =
            activeTab === 'mine' &&
            m.reservedByMeasurerId === measurerUid &&
            m.reservationStatus === 'reserved';
          const isScheduleEditorOpen = scheduleEditorId === m.id;

          return (
            <div key={m.id} className={`bg-white rounded-[32px] overflow-hidden transition-all shadow-sm ${isExp ? 'ring-2 ring-orange-500 shadow-2xl z-10' : ''}`}>
              {/* COMPACT VIEW */}
              <div className="p-4 flex items-center gap-4 cursor-pointer active:bg-gray-50" onClick={() => setExpandedId(isExp ? null : m.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {m.time && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase flex items-center gap-1"><Clock size={10}/>{m.time}</span>}
                    {activeTab === 'mine' && scheduledDisplay && (
                      <span className="bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase flex items-center gap-1">
                        <Clock size={10} />
                        {scheduledDisplay}
                      </span>
                    )}
                    <span className="text-[15px] font-black text-gray-800 uppercase tracking-tight break-words">{m.address}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-400">{m.customerName || 'Без имени'}</span>
                    {!isExp && <span className="text-[12px] font-black text-orange-500">{m.price > 0 ? `${Math.round(m.price)}₽` : ''}</span>}
                  </div>
                </div>
                
                <div className="text-gray-300">
                  {isExp ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>

              {/* DETAILED VIEW — макет как на скриншоте */}
              {isExp && (
                <div className="px-5 pb-6 pt-1 space-y-4 animate-in fade-in slide-in-from-top-3 duration-300">
                  {/* Кнопка звонка */}
                  {m.phone && (
                    <a
                      href={telE164 ? `tel:${telE164}` : '#'}
                      onClick={telE164 ? undefined : (e) => e.preventDefault()}
                      className="flex items-center justify-center gap-3 bg-orange-500 py-4 px-4 rounded-2xl text-white font-bold active:scale-[0.98] transition-all"
                    >
                      <Phone size={20} fill="currentColor" />
                      <span className="tracking-wide">{m.phone}</span>
                    </a>
                  )}

                  {/* Две полоски: оплата и комментарий */}
                  <div className="flex items-center gap-2 py-3 px-4 rounded-2xl bg-gray-100 text-gray-800">
                    <Banknote size={18} className="text-green-500 shrink-0" />
                    <span className="text-[13px] font-medium">
                      За замер платит {m.payerType === 'company' ? 'Безнал / Фирма' : 'ЗАКАЗЧИК'}
                      {m.price > 0 && <span className="text-orange-500 font-semibold"> – {Math.round(m.price)} Р</span>}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 py-3 px-4 rounded-2xl bg-gray-100 text-gray-800">
                    <MessageSquare size={18} className="text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-[13px] font-medium leading-relaxed">{m.comment || 'Стандартный замер и консультация'}</p>
                  </div>

                  {canEditSchedule && (scheduledDisplay || m.measurerNote) && !isScheduleEditorOpen && (
                    <div className="space-y-2">
                      {scheduledDisplay && (
                        <div className="flex items-start gap-2 py-3 px-4 rounded-2xl bg-orange-50 text-gray-800">
                          <Clock size={18} className="text-orange-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wide text-orange-500 mb-0.5">Дата и время замера</p>
                            <p className="text-[13px] font-medium">{scheduledDisplay}</p>
                          </div>
                        </div>
                      )}
                      {m.measurerNote && (
                        <div className="flex items-start gap-2 py-3 px-4 rounded-2xl bg-orange-50 text-gray-800">
                          <MessageSquare size={18} className="text-orange-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wide text-orange-500 mb-0.5">Комментарий замерщика</p>
                            <p className="text-[13px] font-medium leading-relaxed whitespace-pre-wrap">{m.measurerNote}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {canEditSchedule && (
                    <div className="space-y-3">
                      {!isScheduleEditorOpen ? (
                        <button
                          type="button"
                          onClick={(e) => openScheduleEditor(e, m)}
                          className="w-full py-3 px-4 rounded-2xl border border-orange-200 bg-orange-50 text-orange-600 text-xs font-bold uppercase tracking-wide active:scale-[0.98] transition-all"
                        >
                          Дата и комментарий
                        </button>
                      ) : (
                        <div
                          className="p-4 rounded-2xl border border-orange-200 bg-orange-50/60 space-y-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="text-[10px] font-black uppercase tracking-wide text-orange-600">Дата и комментарий</p>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Дата и время замера</label>
                            <input
                              type="datetime-local"
                              value={draftScheduledAt}
                              onChange={(e) => setDraftScheduledAt(e.target.value)}
                              className="w-full py-3 px-3 bg-white border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-orange-300"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Комментарий замерщика</label>
                            <textarea
                              value={draftMeasurerNote}
                              onChange={(e) => setDraftMeasurerNote(e.target.value)}
                              placeholder="Например: позвонить за час, код домофона, особенности подъезда"
                              rows={3}
                              className="w-full py-3 px-3 bg-white border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={closeScheduleEditor}
                              disabled={savingSchedule}
                              className="py-3 rounded-xl border border-gray-200 bg-white text-gray-600 text-xs font-bold uppercase tracking-wide active:scale-[0.98] disabled:opacity-60"
                            >
                              Отмена
                            </button>
                            <button
                              type="button"
                              onClick={(e) => void saveMeasurerSchedule(e, m.id)}
                              disabled={savingSchedule}
                              className="py-3 rounded-xl bg-orange-500 text-white text-xs font-bold uppercase tracking-wide active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                              {savingSchedule ? <Loader2 size={16} className="animate-spin" /> : null}
                              Сохранить
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Карта, маршрут и действие по вкладке */}
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => openMap(m)} className="flex flex-col items-center justify-center gap-1.5 py-4 bg-gray-100 rounded-2xl text-gray-700 active:bg-gray-200 transition-all">
                      <IconMapColor size={39} className="shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wide">Карта</span>
                    </button>
                    <button onClick={() => buildRoute(m)} className="flex flex-col items-center justify-center gap-1.5 py-4 bg-gray-100 rounded-2xl text-gray-700 active:bg-gray-200 transition-all">
                      <IconRouteColor size={39} className="shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wide">Маршрут</span>
                    </button>
                    {activeTab === 'pool' ? (
                      <button
                        onClick={(e) => reserveMeasurement(e, m.id)}
                        className="flex flex-col items-center justify-center gap-1.5 py-4 bg-orange-500 rounded-2xl text-white font-bold active:scale-[0.98] transition-all"
                      >
                        <Timer size={22} />
                        <span className="text-[9px] uppercase tracking-wide leading-tight text-center">Забронировать</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onStartWork?.({ name: m.customerName, phone: m.phone, address: m.address }, m.comment, m.id)}
                        className="flex flex-col items-center justify-center gap-1.5 py-4 bg-orange-500 rounded-2xl text-white font-bold active:scale-[0.98] transition-all"
                      >
                        <Timer size={22} />
                        <span className="text-[9px] uppercase tracking-wide leading-tight text-center">Начать<br />замер</span>
                      </button>
                    )}
                  </div>

                  {activeTab === 'mine' &&
                    m.reservedByMeasurerId === measurerUid &&
                    m.reservationStatus === 'reserved' && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={(e) => releaseReservation(e, m.id)}
                        className="w-full py-3 rounded-2xl border border-gray-200 text-gray-500 text-xs font-bold uppercase tracking-wide active:scale-[0.98] transition-all"
                      >
                        Снять бронь
                      </button>
                      <button
                        type="button"
                        onClick={(e) => requestCancelMeasurement(e, m.id)}
                        className="w-full py-3 rounded-2xl border border-red-200 text-red-500 text-xs font-bold uppercase tracking-wide active:scale-[0.98] transition-all"
                      >
                        Отменить замер
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {cancelConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !cancelling && setCancelConfirmId(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-gray-600">Отмена замера</span>
              <button
                type="button"
                onClick={() => !cancelling && setCancelConfirmId(null)}
                className="p-2 text-gray-400"
                disabled={cancelling}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-2 text-sm text-gray-700 leading-relaxed">
              <p className="font-bold text-gray-800">Отменить замер?</p>
              <p>
                Он исчезнет из «Моих замеров» и не вернётся в общий список.
              </p>
            </div>
            <div className="p-4 pt-0 space-y-2">
              <button
                type="button"
                onClick={() => setCancelConfirmId(null)}
                disabled={cancelling}
                className="w-full py-3.5 rounded-2xl border border-gray-200 text-gray-600 text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-60"
              >
                Не отменять
              </button>
              <button
                type="button"
                onClick={() => void executeCancelMeasurement()}
                disabled={cancelling}
                className="w-full py-3.5 rounded-2xl bg-red-500 text-white text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {cancelling ? <Loader2 size={18} className="animate-spin" /> : null}
                Отменить
              </button>
            </div>
          </div>
        </div>
      )}

      {mapPickerMeasurement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setMapPickerMeasurement(null)}>
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-gray-600">Открыть карту</span>
              <button type="button" onClick={() => setMapPickerMeasurement(null)} className="p-2 text-gray-400"><X size={20} /></button>
            </div>
            <p className="px-4 py-2 text-[11px] text-gray-500 truncate">{mapPickerMeasurement.address}</p>
            <div className="p-4 space-y-2">
              <button type="button" onClick={() => openMapInApp('yandex', mapPickerMeasurement)} className="w-full py-4 rounded-2xl bg-[#fc3f3f]/10 text-[#fc3f3f] font-bold text-sm flex items-center justify-center gap-2">
                <Map size={20} /> Яндекс Карты
              </button>
              <button type="button" onClick={() => openMapInApp('2gis', mapPickerMeasurement)} className="w-full py-4 rounded-2xl bg-[#2e7cf6]/10 text-[#2e7cf6] font-bold text-sm flex items-center justify-center gap-2">
                <Map size={20} /> 2ГИС
              </button>
              <button type="button" onClick={() => openMapInApp('google', mapPickerMeasurement)} className="w-full py-4 rounded-2xl bg-[#4285f4]/10 text-[#4285f4] font-bold text-sm flex items-center justify-center gap-2">
                <Map size={20} /> Google Карты
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UpcomingScreen;
