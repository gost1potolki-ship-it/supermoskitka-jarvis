
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CartItem, OrderState, ProductType, UpcomingMeasurement, PaymentMethod } from '../types';
import { PRICES as DEFAULT_PRICES, COLOR_LABELS, MESH_LABELS, MOUNT_LABELS, CORNER_LABELS, HANDLE_LABELS, OPENING_LABELS, THRESHOLD_LABELS } from '../constants';
import { roundToTens } from '../logic/calculations';
import { calculateOrderTotals } from '../logic/orderTotals';
import { Trash2, Plus, Minus, Truck, ShoppingCart, Hammer, Mic, Square as SquareIcon, Loader2, User, Phone, MapPin, Archive, AlertCircle, BookOpen, Search, X, Pencil, ChevronRight, CheckCircle2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { collection, getDocsFromCache, getDocsFromServer, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

interface CartScreenProps {
  order: OrderState;
  onRemoveItem: (id: string) => void;
  onEditItem: (item: CartItem) => void;
  onAddItemToOrder: () => void;
  onUpdateOrder: (updates: Partial<OrderState>) => void;
  onSaveToArchive: () => boolean;
  onClearOrder: () => void;
  isEditingArchiveOrder?: boolean;
  saveButtonLabel?: string;
  prices: typeof DEFAULT_PRICES;
}

const CORNER_ADJ: Record<string, string> = { plastic: 'пластиковые', aluminum: 'алюминиевые' };
const HANDLE_ADJ: Record<string, string> = { plastic: 'пластиковые', metal: 'металлические' };

/** Заголовки типов изделий в «Позиции в заказе» */
const TYPE_DISPLAY_LABELS: Partial<Record<ProductType, string>> = {
  [ProductType.FRAME]: 'Москитная сетка РАМОЧНАЯ',
  [ProductType.WING]: 'Москитная сетка "Крыло"',
  [ProductType.INSIDE_INSERT]: 'Внутревставная VSN москитная сетка',
  [ProductType.DOOR]: 'Дверная распашная москитная сетка',
  [ProductType.PLISSE_NET]: 'Москитная сетка ПЛИССЕ'
};

/** Подробное описание изделия для отображения в корзине */
const formatItemDetails = (item: CartItem): string => {
  const L = (v: any, labels: Record<string, string>) => (v && labels[v]) ? labels[v] : null;
  const color = L(item.color, COLOR_LABELS);
  const mesh = L(item.mesh, MESH_LABELS);
  const mount = L(item.mount, MOUNT_LABELS);
  const cornerAdj = item.cornerType ? CORNER_ADJ[item.cornerType] : null;
  const handleAdj = item.handleType ? HANDLE_ADJ[item.handleType] : null;
  const opening = L(item.opening, OPENING_LABELS);
  const threshold = L(item.threshold, THRESHOLD_LABELS);
  const size = (item.width && item.height) ? `${item.width}×${item.height} мм` : null;
  const parts: string[] = [];

  switch (item.type) {
    case ProductType.FRAME:
      if (color && item.frameProfile) parts.push(`Профиль ${color} ${item.frameProfile} мм`);
      if (mesh) parts.push(`полотно ${mesh}`);
      if (item.height && item.height > 1000) parts.push('импост');
      if (cornerAdj) parts.push(`уголки ${cornerAdj}`);
      if (handleAdj) parts.push(`2 ручки ${handleAdj}`);
      if (mount) parts.push(`крепления ${mount}`);
      break;

    case ProductType.WING:
      if (color) parts.push(`Профиль ${color} 30 мм`);
      if (mesh) parts.push(`полотно ${mesh}`);
      if (item.height && item.height > 1000) parts.push('импост');
      if (cornerAdj) parts.push(`уголки ${cornerAdj}`);
      if (handleAdj) parts.push(`2 ручки ${handleAdj}`);
      if (mount) parts.push(`крепления ${mount}`);
      break;

    case ProductType.DOOR:
      if (color && item.doorProfile) parts.push(`Профиль ${color} ${item.doorProfile} мм`);
      if (mesh) parts.push(`полотно ${mesh}`);
      if (item.hingesCount) parts.push(`${item.hingesCount} петли`);
      if (item.hasLatch) parts.push('защелка');
      if (item.hasBolt) parts.push('шпингалет');
      break;

    case ProductType.INSIDE_INSERT:
      if (color) parts.push(`Профиль ${color} ВСН/ВСМ`);
      if (mesh) parts.push(`полотно ${mesh}`);
      if (handleAdj) parts.push(`ручки ${handleAdj}`);
      if (mount) parts.push(`крепления ${mount}`);
      break;

    case ProductType.ROLL:
      if (color) parts.push(`Профиль ${color}`);
      if (mesh) parts.push(`полотно ${mesh}`);
      break;

    case ProductType.PLISSE_NET:
      if (color) parts.push(`Профиль ${color}`);
      if (mesh) parts.push(`полотно ${mesh}`);
      if (opening) parts.push(`открывание ${opening}`);
      if (threshold && threshold !== 'Стандарт') parts.push(`порог ${threshold}`);
      if (item.handles) parts.push(`${item.handles} ручки`);
      break;

    case ProductType.JALOUSIE_CLASSIC:
    case ProductType.JALOUSIE_LIGHT:
    case ProductType.JALOUSIE_COZY:
      if (color) parts.push(`Профиль ${color}`);
      if (mesh) parts.push(`ткань ${mesh}`);
      if (opening && item.type !== ProductType.JALOUSIE_LIGHT) parts.push(`открывание ${opening}`);
      if (item.handles && item.type !== ProductType.JALOUSIE_LIGHT) parts.push(`${item.handles} ручки`);
      break;

    case ProductType.COMB:
      if (handleAdj) parts.push(`Гребенка ${handleAdj}`);
      break;

    case ProductType.ADJUSTMENT:
      if (item.subType) {
        const adjLabels: Record<string, string> = { door: 'Дверь ПВХ', pvc: 'Дверь ПВХ', window: 'Оконная створка', alu: 'Алюминиевая створка' };
        parts.push(adjLabels[item.subType] || item.subType);
      }
      break;

    case ProductType.SEAL:
      parts.push('Замена уплотнителя');
      break;

    case ProductType.CHILD_LOCK:
      parts.push('Установка детского замка');
      break;

    default:
      return item.details;
  }

  const main = parts.length ? parts.join(', ') : item.details;
  const prefix = size ? `${size}. ` : '';
  return prefix + main;
};

// Повторим нормализатор здесь для независимости
const normalizeMeasurement = (doc: any): UpcomingMeasurement => {
  const data = doc.data ? doc.data() : doc;
  const id = doc.id || data.id || Math.random().toString();
  const find = (keys: string[]) => {
    for (const k of keys) {
      const foundKey = Object.keys(data).find(dk => dk.toLowerCase() === k.toLowerCase());
      if (foundKey && data[foundKey]) return data[foundKey];
    }
    return '';
  };
  const rawAddr = find(['address', 'адрес', 'объект', 'A']);
  const payer = find(['payer_text', 'F', 'платит', 'кто платит']).toLowerCase();
  
  // Fix: Removed 'raw' property which was not defined in UpcomingMeasurement interface
  return {
    id,
    address: rawAddr,
    apartment: find(['apt', 'flat', 'кв', 'квартира']),
    customerName: find(['name', 'клиент', 'customer', 'B']),
    phone: find(['phone', 'телефон', 'tel', 'C']),
    comment: find(['comment', 'заметка', 'managerComment', 'D']),
    price: parseFloat(find(['amount_rub', 'E', 'цена', 'сумма'])) || 0,
    payerType: (payer.includes('фирма') || payer.includes('офис')) ? 'company' : 'customer'
  };
};

const CartScreen: React.FC<CartScreenProps> = ({
  order,
  onRemoveItem,
  onEditItem,
  onAddItemToOrder,
  onUpdateOrder,
  onSaveToArchive,
  onClearOrder,
  isEditingArchiveOrder = false,
  saveButtonLabel = 'Сохранить замер',
  prices,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [showMicPermissionHint, setShowMicPermissionHint] = useState(false);
  const [showRequiredFieldsWarning, setShowRequiredFieldsWarning] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showArchiveSuccess, setShowArchiveSuccess] = useState(false);
  
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [upcomingMeasurements, setUpcomingMeasurements] = useState<UpcomingMeasurement[]>([]);
  const [isLoadingMeasurements, setIsLoadingMeasurements] = useState(false);
  const [measurementsLoadError, setMeasurementsLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [discountExpanded, setDiscountExpanded] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const topAnchorRef = useRef<HTMLDivElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Очистка таймеров и ресурсов микрофона при размонтировании (предотвращение утечек)
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      timeoutIdsRef.current.forEach((id) => clearTimeout(id));
      timeoutIdsRef.current = [];
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      processorRef.current?.disconnect();
      processorRef.current = null;
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      pcmChunksRef.current = [];
    };
  }, []);

  useEffect(() => {
    // При каждом открытии корзины гарантированно прокручиваем в начало (к блоку "Данные клиента").
    const scrollToTop = () => topAnchorRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    scrollToTop();
    const rafId = requestAnimationFrame(scrollToTop);
    const t = setTimeout(scrollToTop, 0);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(t);
    };
  }, []);

  const today = useMemo(() => new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }), []);

  const MAINTENANCE_TYPES = [ProductType.SEAL, ProductType.COMB, ProductType.CHILD_LOCK, ProductType.ADJUSTMENT];
  const isProductItem = (item: CartItem) => !MAINTENANCE_TYPES.includes(item.type);
  const totals = useMemo(() => calculateOrderTotals(order, prices), [order, prices]);
  const feePerProduct = totals.measurementFee > 0 && totals.productCount > 0 ? totals.measurementFee / totals.productCount : 0;
  const itemsTotalWithFee = totals.itemsTotalWithFee;
  const totalInstallCost = totals.installTotal;
  const deliveryCost = totals.deliveryCost;
  const discountPercent = totals.discountPercent;
  const paymentMethod: PaymentMethod = totals.paymentMethod;
  const paymentSurcharge = totals.paymentSurcharge;
  const total = totals.grandTotal;

  /** Цена позиции для отображения: у изделий добавлена доля стоимости замера (чтобы сумма позиций = итог по позициям) */
  const getItemDisplayPrice = useMemo(() => {
    const productIndices = order.items.map((item, i) => (isProductItem(item) ? i : -1)).filter(i => i >= 0);
    const lastProductIdx = productIndices.length > 0 ? productIndices[productIndices.length - 1] : -1;
    return (item: CartItem, index: number) => {
      if (!isProductItem(item) || totals.measurementFee <= 0 || totals.productCount === 0) return item.price;
      if (index === lastProductIdx) {
        const othersSum = order.items.reduce((sum, it, i) => {
          if (i === index) return sum;
          return sum + (isProductItem(it) ? roundToTens(Math.round(it.price + feePerProduct)) : it.price);
        }, 0);
        return (itemsTotalWithFee - othersSum);
      }
      return roundToTens(Math.round(item.price + feePerProduct));
    };
  }, [order.items, totals.measurementFee, totals.productCount, feePerProduct, itemsTotalWithFee]);

  const handleUpdateQuantity = (id: string, newQty: number) => {
    if (newQty < 1) return;
    const newItems = order.items.map(item => {
      if (item.id === id) {
        const oldQty = item.quantity || 1;
        const unitPrice = item.price / oldQty;
        const unitInstallPrice = item.installPrice / oldQty;
        return { ...item, quantity: newQty, price: roundToTens(unitPrice * newQty), installPrice: roundToTens(unitInstallPrice * newQty) };
      }
      return item;
    });
    onUpdateOrder({ items: newItems });
  };

  const fetchUpcomingMeasurements = async () => {
    if (!isMountedRef.current) return;
    setMeasurementsLoadError(null);
    setIsLoadingMeasurements(true);
    try {
      const q = query(collection(db, 'upcoming_measurements'), orderBy('address', 'asc'));
      const snapshot = await getDocsFromServer(q);
      if (!isMountedRef.current) return;
      const data = snapshot.docs.map(normalizeMeasurement);
      setUpcomingMeasurements(data);
    } catch (err) {
      console.error(err);
      if (isMountedRef.current) {
        try {
          const q = query(collection(db, 'upcoming_measurements'), orderBy('address', 'asc'));
          const cachedSnapshot = await getDocsFromCache(q);
          if (!isMountedRef.current) return;
          const data = cachedSnapshot.docs.map(normalizeMeasurement);
          setUpcomingMeasurements(data);
          if (data.length === 0) {
            setMeasurementsLoadError('Не удалось загрузить данные. Проверьте подключение к сети.');
          }
        } catch (cacheErr) {
          console.error(cacheErr);
          if (isMountedRef.current) {
            setMeasurementsLoadError('Не удалось загрузить данные. Проверьте подключение к сети.');
          }
        }
      }
    } finally {
      if (isMountedRef.current) setIsLoadingMeasurements(false);
    }
  };

  const handleSelectMeasurement = (m: UpcomingMeasurement) => {
    onUpdateOrder({ customer: { name: m.customerName, phone: m.phone, address: m.address } });
    setShowAddressModal(false);
    setSearchQuery('');
  };

  const filteredMeasurements = useMemo(() => {
    if (!searchQuery) return upcomingMeasurements;
    const low = searchQuery.toLowerCase();
    return upcomingMeasurements.filter(m => m.address.toLowerCase().includes(low) || m.customerName.toLowerCase().includes(low));
  }, [upcomingMeasurements, searchQuery]);

  const MIC_HINT_STORAGE_KEY = 'calc_mic_permission_hint_shown';

  const startRecording = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = audioCtx;
      pcmChunksRef.current = [];

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        pcmChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(audioCtx.destination);

      console.log('[Mic] Recording started, sampleRate:', audioCtx.sampleRate);
      if (isMountedRef.current) setIsRecording(true);
    } catch (err) {
      console.error('[Mic] Error:', err);
      if (isMountedRef.current) setMicError('Нет доступа к микрофону. Проверьте разрешения приложения.');
    }
  };

  const onMicButtonPress = () => {
    if (!localStorage.getItem(MIC_HINT_STORAGE_KEY)) {
      setShowMicPermissionHint(true);
      return;
    }
    startRecording();
  };

  const requestMicPermissionAndCloseHint = async () => {
    if (isMountedRef.current) setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      localStorage.setItem(MIC_HINT_STORAGE_KEY, '1');
      if (isMountedRef.current) setShowMicPermissionHint(false);
    } catch (err) {
      console.error('[Mic] Permission error:', err);
      if (isMountedRef.current) {
        setMicError('Доступ к микрофону запрещён. Включите его в настройках приложения.');
        setShowMicPermissionHint(false);
      }
    }
  };

  const stopRecording = () => {
    if (!audioCtxRef.current) return;
    const chunks = pcmChunksRef.current;
    const sampleRate = audioCtxRef.current.sampleRate;

    processorRef.current?.disconnect();
    audioCtxRef.current.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current = null;
    processorRef.current = null;
    streamRef.current = null;
    setIsRecording(false);

    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    console.log('[Mic] Recording stopped, samples:', totalLen, 'sampleRate:', sampleRate);

    if (totalLen < 4800) {
      setMicError('Слишком короткая запись. Удерживайте кнопку дольше.');
      return;
    }

    const pcm16 = new Int16Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm16[offset++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
    }

    const blob = new Blob([pcm16.buffer], { type: 'audio/x-pcm' });
    console.log('[Mic] PCM blob size:', blob.size, 'bytes');
    transcribeAudio(blob, sampleRate);
  };

  const transcribeAudio = async (audioBlob: Blob, sampleRate = 48000) => {
    if (!isMountedRef.current) return;
    setIsTranscribing(true);
    setMicError(null);

    const apiKey = import.meta.env.VITE_YANDEX_API_KEY;
    const folderId = import.meta.env.VITE_YANDEX_FOLDER_ID;

    if (!apiKey) {
      if (isMountedRef.current) {
        setMicError('API-ключ Яндекса не найден (VITE_YANDEX_API_KEY). Проверьте .env.local');
        setIsTranscribing(false);
      }
      return;
    }
    if (!folderId) {
      if (isMountedRef.current) {
        setMicError('Folder ID Яндекса не найден (VITE_YANDEX_FOLDER_ID). Проверьте .env.local');
        setIsTranscribing(false);
      }
      return;
    }

    // В dev работает Vite proxy; в APK задайте VITE_API_BASE (URL вашего бэкенда, проксирующего Yandex STT)
    const apiBase = (import.meta.env.VITE_API_BASE as string) || '';
    const url = `${apiBase}/api/yandex-stt/speech/v1/stt:recognize?topic=general&lang=ru-RU&folderId=${folderId}&format=lpcm&sampleRateHertz=${sampleRate}`;
    console.log('[STT] Sending request:', url, 'blob size:', audioBlob.size);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Api-Key ${apiKey}` },
        body: audioBlob,
        signal: controller.signal,
      });

      const rawText = await response.text();
      console.log('[STT] Response:', response.status, rawText);

      if (!response.ok) {
        let msg = `Яндекс STT: HTTP ${response.status}`;
        try {
          const errData = JSON.parse(rawText);
          msg = errData.error_message || errData.message || rawText.slice(0, 200);
        } catch {}
        throw new Error(msg);
      }

      const data = JSON.parse(rawText);

      if (data.error_code) {
        throw new Error(data.error_message || 'Ошибка распознавания');
      }

      if (data.result) {
        console.log('[STT] Recognized:', data.result);
        if (isMountedRef.current) {
          onUpdateOrder({
            generalComment: order.generalComment
              ? order.generalComment + ' ' + data.result
              : data.result
          });
        }
      } else {
        if (isMountedRef.current) setMicError('Речь не распознана. Говорите громче и чётче.');
      }

    } catch (e: any) {
      console.error('[STT] Error:', e);
      if (isMountedRef.current) {
        if (e.name === 'AbortError') {
          setMicError('Таймаут: Яндекс не ответил за 15 секунд. Проверьте интернет.');
        } else {
          setMicError(e.message || 'Ошибка сети или API Яндекса');
        }
      }
    } finally {
      if (timeoutId != null) clearTimeout(timeoutId);
      if (isMountedRef.current) setIsTranscribing(false);
    }
  };

  const updateCustomer = (field: 'name' | 'phone' | 'address', value: string) => {
    onUpdateOrder({ customer: { ...(order.customer || { name: '', phone: '', address: '' }), [field]: value } });
  };

  const hasRequiredCustomerFields = () => {
    const phone = order.customer?.phone?.trim() || '';
    const address = order.customer?.address?.trim() || '';
    return Boolean(phone && address);
  };

  const focusMissingRequiredField = () => {
    const phone = order.customer?.phone?.trim() || '';
    const address = order.customer?.address?.trim() || '';
    const target = !phone ? phoneInputRef.current : !address ? addressInputRef.current : null;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus();
  };

  const performArchiveSave = () => {
    const saved = onSaveToArchive();
    if (!saved) return;
    setShowArchiveSuccess(true);
    const t = setTimeout(() => {
      if (isMountedRef.current) {
        setShowArchiveSuccess(false);
      }
    }, 1500);
    timeoutIdsRef.current.push(t);
  };

  return (
    <div ref={topAnchorRef} className="p-4 space-y-6 relative">
      <div className="rounded-3xl p-5 shadow-xl space-y-4 transition-all bg-orange-500">
        <div className="flex justify-between items-center border-b pb-3 border-orange-400">
           <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-white">
            <User size={16} /> Данные клиента
          </h3>
          <div className="flex items-center gap-1.5 text-orange-100 bg-orange-600 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
            {today}
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="relative">
            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-400" />
            <input type="text" placeholder="Имя клиента *" value={order.customer?.name} onChange={e => updateCustomer('name', e.target.value)} className="w-full pl-11 pr-4 py-3.5 bg-white border-transparent rounded-2xl text-sm font-bold outline-none shadow-sm" />
          </div>
          <div className="relative">
            <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-400" />
            <input ref={phoneInputRef} type="tel" placeholder="Телефон *" value={order.customer?.phone} onChange={e => updateCustomer('phone', e.target.value)} className="w-full pl-11 pr-4 py-3.5 bg-white border-transparent rounded-2xl text-sm font-bold outline-none shadow-sm" />
          </div>
          <div className="relative">
            <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-400" />
            <input ref={addressInputRef} type="text" placeholder="Адрес объекта *" value={order.customer?.address} onChange={e => updateCustomer('address', e.target.value)} className="w-full pl-11 pr-14 py-3.5 bg-white border-transparent rounded-2xl text-sm font-bold outline-none shadow-sm" />
            <button onClick={() => { setShowAddressModal(true); fetchUpcomingMeasurements(); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 bg-orange-500 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 border-2 border-white/20">
              <BookOpen size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-gray-200">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">Позиции в заказе</h2>
        </div>
        <div className="p-4 space-y-3">
        {isEditingArchiveOrder && (
          <button
            type="button"
            onClick={onAddItemToOrder}
            className="w-full py-3 bg-orange-500 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 hover:bg-orange-600 transition-transform"
          >
            <Plus size={16} />
            Добавить позицию
          </button>
        )}
        {order.items.map((item, index) => (
          <div key={item.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-5 space-y-3">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0 pr-4">
                <h4 className="font-black text-gray-800 text-[14px] uppercase tracking-tight truncate">{TYPE_DISPLAY_LABELS[item.type] ?? item.type}</h4>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{formatItemDetails(item)}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => onEditItem(item)} className="text-gray-300 p-2"><Pencil size={18} /></button>
                <button onClick={() => onRemoveItem(item.id)} className="text-red-100 p-2 hover:text-red-500"><Trash2 size={18} /></button>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-50">
              <div className="flex items-center bg-gray-50 rounded-xl p-1 border border-gray-100">
                <button onClick={() => handleUpdateQuantity(item.id, (item.quantity || 1) - 1)} className="p-1.5 text-gray-400"><Minus size={16} /></button>
                <span className="w-8 text-center text-xs font-black text-gray-700">{item.quantity || 1}</span>
                <button onClick={() => handleUpdateQuantity(item.id, (item.quantity || 1) + 1)} className="p-1.5 text-gray-400"><Plus size={16} /></button>
              </div>
              <div className="font-black text-orange-500 text-base">{getItemDisplayPrice(item, index)} ₽</div>
            </div>
          </div>
        ))}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="pb-3 border-b border-gray-200 mb-3">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">Монтажные работы</h2>
        </div>
        <div className="space-y-3">
          <div className="flex rounded-xl overflow-hidden border border-gray-100">
            <button
              type="button"
              onClick={() => onUpdateOrder({ globalInstall: true, installOverride: null })}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${order.globalInstall ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              Нужны
            </button>
            <button
              type="button"
              onClick={() => onUpdateOrder({ globalInstall: false, installOverride: null })}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${!order.globalInstall ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              Не нужны
            </button>
          </div>
          {order.globalInstall && totalInstallCost > 0 && (
            <div className="space-y-2">
              <label className="flex w-full min-w-0 items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl cursor-text">
                  <Hammer size={18} className="text-gray-400 shrink-0 pointer-events-none" />
                  <input
                    type="number"
                    placeholder="или введите свою стоимость"
                    value={order.installOverride != null ? order.installOverride : ''}
                    onChange={e => {
                      const val = e.target.value;
                      onUpdateOrder({ installOverride: val === '' ? null : Math.max(0, parseInt(val, 10) || 0) });
                    }}
                    className="flex-1 min-w-0 w-full text-sm font-medium text-gray-800 placeholder-gray-400 outline-none bg-transparent"
                  />
                </label>
              {order.installOverride != null && (
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-orange-500 font-bold flex items-center gap-1">
                    <AlertCircle size={10} /> Цена изменена вручную
                  </p>
                  <button type="button" onClick={() => onUpdateOrder({ installOverride: null })} className="text-[10px] text-gray-400 hover:text-gray-600 font-bold">Сбросить</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="pb-3 border-b border-gray-200 mb-2">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">Доставка</h2>
        </div>
        <div className="flex flex-nowrap gap-1 rounded-xl border border-gray-100 p-0.5">
            <button
              type="button"
              onClick={() => onUpdateOrder({ deliveryType: 'city' })}
              className="flex flex-1 min-w-0 flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-colors hover:bg-gray-50"
            >
              <span className={`flex items-center justify-center w-4 h-4 rounded-full border-2 shrink-0 ${order.deliveryType === 'city' ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'}`}>
                {order.deliveryType === 'city' && <Check size={10} className="text-white" strokeWidth={3} />}
              </span>
              <span className={`text-[11px] font-medium text-center leading-tight ${order.deliveryType === 'city' ? 'text-gray-800' : 'text-gray-600'}`}>По городу</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateOrder({ deliveryType: 'out' })}
              className="flex flex-1 min-w-0 flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-colors hover:bg-gray-50"
            >
              <span className={`flex items-center justify-center w-4 h-4 rounded-full border-2 shrink-0 ${order.deliveryType === 'out' ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'}`}>
                {order.deliveryType === 'out' && <Check size={10} className="text-white" strokeWidth={3} />}
              </span>
              <span className={`text-[11px] font-medium text-center leading-tight ${order.deliveryType === 'out' ? 'text-gray-800' : 'text-gray-600'}`}>За город</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateOrder({ deliveryType: 'pickup' })}
              className="flex flex-1 min-w-0 flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-colors hover:bg-gray-50"
            >
              <span className={`flex items-center justify-center w-4 h-4 rounded-full border-2 shrink-0 ${order.deliveryType === 'pickup' ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'}`}>
                {order.deliveryType === 'pickup' && <Check size={10} className="text-white" strokeWidth={3} />}
              </span>
              <span className={`text-[11px] font-medium text-center leading-tight ${order.deliveryType === 'pickup' ? 'text-gray-800' : 'text-gray-600'}`}>Самовывоз</span>
            </button>
          </div>
          {order.deliveryType === 'out' && (
            <div className="flex items-center gap-2 pt-1">
              <label className="text-xs font-bold text-gray-500 whitespace-nowrap">Расстояние, км:</label>
              <input
                type="number"
                min={1}
                max={999}
                value={order.deliveryKm || ''}
                onChange={e => onUpdateOrder({ deliveryKm: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                className="w-20 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-800"
              />
            </div>
          )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="pb-3 border-b border-gray-200 mb-3">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">Комментарий к замеру</h2>
        </div>
        <div className="space-y-3">
          <textarea
            placeholder="Добавьте заметку для менеджера или производства..."
            value={order.generalComment || ''}
            onChange={e => onUpdateOrder({ generalComment: e.target.value })}
            rows={3}
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-700 placeholder-gray-400 outline-none resize-none leading-relaxed"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onPointerDown={onMicButtonPress}
              onPointerUp={stopRecording}
              onPointerLeave={stopRecording}
              disabled={isTranscribing}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-sm transition-all active:scale-95 select-none shrink-0
                ${isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }
                ${isTranscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isTranscribing
                ? <><Loader2 size={14} className="animate-spin" /> Обработка…</>
                : isRecording
                  ? <><SquareIcon size={14} /> Запись…</>
                  : <><Mic size={14} /> голос</>
              }
            </button>
            <span className="text-[11px] text-gray-400">Зажмите кнопку и говорите. ИИ автоматически переведёт.</span>
            <ChevronRight size={16} className="text-gray-300 shrink-0 ml-auto" />
          </div>
          {order.generalComment && (
            <button
              type="button"
              onClick={() => onUpdateOrder({ generalComment: '' })}
              className="text-[10px] text-gray-400 hover:text-red-500 font-bold uppercase tracking-widest"
            >
              Очистить
            </button>
          )}
          {micError && (
            <p className="text-[10px] text-red-400 font-bold flex items-center gap-1">
              <AlertCircle size={12} /> {micError}
            </p>
          )}
        </div>
      </div>

      <div className="bg-gray-900 text-white p-6 rounded-[32px] shadow-2xl space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Позиции</span>
            <span className="font-bold">{itemsTotalWithFee} ₽</span>
          </div>
          {order.globalInstall && totalInstallCost > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Монтаж</span>
              <span className="font-bold">{totalInstallCost} ₽</span>
            </div>
          )}
          {(order.deliveryType === 'city' || order.deliveryType === 'out') && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Доставка</span>
              <span className="font-bold">{deliveryCost} ₽</span>
            </div>
          )}
          {/* Скидка: при нажатии разворачивается на Без скидки / 5% / 10% */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setDiscountExpanded(prev => !prev)}
              className="w-full flex justify-between items-center text-sm text-left py-1.5 rounded-lg hover:bg-gray-800/50 transition-colors"
            >
              <span className="text-gray-400">Скидка</span>
              <span className="font-bold text-white flex items-center gap-1">
                {discountPercent === 0 ? 'Без скидки' : `${discountPercent}%`}
                {discountExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </span>
            </button>
            {discountExpanded && (
              <div className="flex gap-2 mt-2">
                {([0, 5, 10] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      onUpdateOrder({ orderDiscountPercent: p });
                      setDiscountExpanded(false);
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                      discountPercent === p
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    {p === 0 ? 'Без скидки' : `${p}%`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 py-1.5 text-gray-500 hover:text-gray-400 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={order.includeMeasurementFee === true}
              onChange={e => onUpdateOrder({ includeMeasurementFee: e.target.checked })}
              className="rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500/50"
            />
            <span className="text-[10px] font-medium">
              Страховой депозит входит в итог — {(prices.price_settings.logistics.measurement_fee ?? 1000).toLocaleString('ru-RU')} ₽
            </span>
          </label>
          <div className="pt-1">
            <span className="text-gray-400 text-sm">Способ оплаты</span>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => onUpdateOrder({ paymentMethod: 'cash' })}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                  paymentMethod === 'cash'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                Наличными
              </button>
              <button
                type="button"
                onClick={() => onUpdateOrder({ paymentMethod: 'qr' })}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                  paymentMethod === 'qr'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                Картой / QR (+8%)
              </button>
            </div>
          </div>
          {paymentSurcharge > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Оплата QR/картой (+8%)</span>
              <span className="font-bold">{paymentSurcharge} ₽</span>
            </div>
          )}
        </div>
        <div className="flex justify-between items-end border-t border-gray-800 pt-4">
          <span className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Итого к оплате</span>
          <span className="text-3xl font-black">{total} ₽</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              if (order.items.length === 0) {
                alert('Корзина пуста. Нечего сохранять в архив.');
                return;
              }
              if (!hasRequiredCustomerFields()) {
                setShowRequiredFieldsWarning(true);
                return;
              }
              performArchiveSave();
            }}
            className="w-full min-w-0 h-12 bg-[#0088cc] text-white rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 hover:bg-[#007ab8] overflow-hidden"
          >
            <Archive size={18} />
            <span className="truncate">{saveButtonLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (order.items.length === 0) {
                onClearOrder();
                return;
              }
              const confirmText = isEditingArchiveOrder
                ? 'Выйти из редактирования? Изменения не будут сохранены.'
                : 'Отменить замер? Текущий расчёт не сохранится.';
              if (window.confirm(confirmText)) {
                onClearOrder();
              }
            }}
            className="w-full min-w-0 h-12 bg-red-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 hover:bg-red-600 overflow-hidden"
          >
            <X size={18} />
            <span className="truncate">{isEditingArchiveOrder ? 'Выйти' : 'Отмена'}</span>
          </button>
        </div>
      </div>

      {showMicPermissionHint && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <Mic size={24} className="text-orange-500" />
              </div>
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Доступ к микрофону</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              Для надиктовки комментария приложению нужен доступ к микрофону. Нажмите «Разрешить» — откроется запрос системы, разрешите использование микрофона.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowMicPermissionHint(false); }}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-gray-500 border border-gray-200 hover:bg-gray-50"
              >
                Позже
              </button>
              <button
                type="button"
                onClick={requestMicPermissionAndCloseHint}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-orange-500 hover:bg-orange-600 active:scale-95"
              >
                Разрешить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showAddressModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden flex flex-col max-h-[80vh] shadow-2xl">
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">Выбор из базы</h3>
              <button onClick={() => setShowAddressModal(false)} className="text-gray-300"><X size={24} /></button>
            </div>
            <div className="px-4 py-3 bg-gray-50">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Поиск по адресу или имени..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {isLoadingMeasurements ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-orange-500" /></div>
              ) : measurementsLoadError ? (
                <div className="py-8 px-4 text-center space-y-4">
                  <p className="text-sm text-red-600 font-medium">{measurementsLoadError}</p>
                  <button type="button" onClick={() => fetchUpcomingMeasurements()} className="py-2.5 px-4 rounded-xl bg-orange-500 text-white text-sm font-bold active:scale-95">
                    Повторить
                  </button>
                </div>
              ) : (
                filteredMeasurements.map(m => (
                <button key={m.id} onClick={() => handleSelectMeasurement(m)} className="w-full text-left p-4 bg-white border border-gray-100 rounded-2xl active:bg-orange-50 transition-all flex justify-between items-center group">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-[12px] font-black text-gray-800 uppercase tracking-tight truncate">{m.address}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-orange-500 font-bold">{m.customerName}</span>
                      {m.phone && <span className="text-[9px] text-gray-300">{m.phone}</span>}
                    </div>
                    {m.comment && <p className="text-[9px] text-gray-400 italic truncate mt-0.5">{m.comment}</p>}
                  </div>
                  <ChevronRight size={16} className="text-gray-200 group-active:text-orange-500" />
                </button>
              )))}
            </div>
          </div>
        </div>
      )}

      {showArchiveSuccess && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] p-8 shadow-2xl flex flex-col items-center gap-4 animate-pulse">
            <CheckCircle2 size={56} className="text-green-500" />
            <p className="text-lg font-black text-gray-800 uppercase tracking-widest">Замер выполнен</p>
          </div>
        </div>,
        document.body
      )}

      {showRequiredFieldsWarning && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="w-12 h-12" aria-hidden="true">
                  <path d="M12 2.5L22 20.5H2L12 2.5Z" fill="#f59e0b" stroke="#d97706" strokeWidth="1.5" />
                </svg>
                <span className="absolute text-white text-xl font-black leading-none">!</span>
              </div>
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Внимание</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-5">
              Перед сохранением заполните обязательные поля: Телефон и Адрес объекта.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowRequiredFieldsWarning(false);
                  setTimeout(() => focusMissingRequiredField(), 0);
                }}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-gray-600 border border-gray-200 hover:bg-gray-50"
              >
                Заполнить поля
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRequiredFieldsWarning(false);
                  performArchiveSave();
                }}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-orange-500 hover:bg-orange-600 active:scale-95"
              >
                Все равно продолжить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default CartScreen;
