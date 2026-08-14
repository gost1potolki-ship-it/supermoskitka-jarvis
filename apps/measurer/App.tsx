import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ProductType, CartItem, OrderState, ArchivedOrder, PaymentMethod, OrderWorkStatus, UserProfile } from './types';
import MenuScreen from './screens/MenuScreen';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import CalcScreen from './screens/CalcScreen';
import CartScreen from './screens/CartScreen';
import ArchiveScreen, { normalizeArchiveOrder, type ArchiveWorkStatusPaymentUpdate } from './screens/ArchiveScreen';
import AdminScreen from './screens/AdminScreen';
import UpcomingScreen from './screens/UpcomingScreen';
import InProgressScreen from './screens/InProgressScreen';
import { ShoppingCart, ArrowLeft, Archive, Home, Lock, X, Loader2 } from 'lucide-react';
import { PRICES as DEFAULT_PRICES } from './constants';
import { db } from './firebase';
import { getUserProfile, signOutUser, subscribeAuthState } from './lib/auth';
// Consolidating firestore imports from the modular SDK
import { collection, onSnapshot, query, where, deleteDoc, doc, setDoc, getDoc, getDocsFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';

type ScreenState = 'splash' | 'menu' | 'products' | 'calc' | 'cart' | 'archive' | 'admin' | 'upcoming' | 'inProgress';
type AuthStatus = 'loading' | 'anonymous' | 'authenticated';
type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'error';
type OutboxOperation = 'upsert' | 'delete';

interface PendingArchiveOutboxEntry {
  archiveId: string;
  operation: OutboxOperation;
  order?: ArchivedOrder;
  syncToken?: string;
  createdAt: number;
  status: OutboxStatus;
  lastError?: string;
}

const PENDING_ARCHIVE_OUTBOX_KEY = 'measurer_pending_archive_orders';
const EDITING_ARCHIVE_ORDER_ID_KEY = 'measurer_current_order_editing_archive_id';
const EDITING_ARCHIVE_ORDER_DATE_KEY = 'measurer_current_order_editing_archive_date';
const ACTIVE_UPCOMING_ID_KEY = 'measurer_active_upcoming_id';
const ACTIVE_UPCOMING_FLOW_KEY = 'measurer_active_upcoming_flow';
const DEFAULT_PAYMENT_METHOD: PaymentMethod = 'qr';
const ACTIVE_OUTBOX_STATUSES: OutboxStatus[] = ['pending', 'syncing', 'error'];
const WORK_STATUS_LABELS: Record<OrderWorkStatus, string> = {
  waiting: 'В ожидании',
  in_production: 'В производстве',
  ready: 'Готов к монтажу',
};
const WORK_STATUS_RANK: Record<OrderWorkStatus, number> = {
  waiting: 0,
  in_production: 1,
  ready: 2,
};
const ADVANCED_WORK_STATUSES = new Set(['in_production', 'ready', 'completed', 'pickup']);
const OUTBOX_STATUS_GUARD_FIELDS = [
  'workStatus',
  'workStatusLabel',
  'workStatusUpdatedAt',
  'measurementRequired',
  'measurementPaidCash',
  'measurementFee',
  'grandTotal',
  'managerTotal',
  'amountDue',
  'total',
] as const;

const isAdvancedWorkStatus = (status: unknown): boolean =>
  typeof status === 'string' && ADVANCED_WORK_STATUSES.has(status);

const pickOutboxStatusGuardFields = (source: Record<string, unknown>): Partial<ArchivedOrder> => {
  const patch: Partial<ArchivedOrder> = {};
  for (const key of OUTBOX_STATUS_GUARD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      (patch as Record<string, unknown>)[key] = source[key];
    }
  }
  return patch;
};

const mergeWorkStatusFields = (
  cloud: Pick<ArchivedOrder, 'workStatus' | 'workStatusLabel' | 'workStatusUpdatedAt'>,
  outbox?: Pick<ArchivedOrder, 'workStatus' | 'workStatusLabel' | 'workStatusUpdatedAt'> | null
): Pick<ArchivedOrder, 'workStatus' | 'workStatusLabel' | 'workStatusUpdatedAt'> => {
  const cloudStatus: OrderWorkStatus = cloud.workStatus ?? 'waiting';
  const outboxStatus: OrderWorkStatus = outbox?.workStatus ?? 'waiting';
  const cloudRank = WORK_STATUS_RANK[cloudStatus];
  const outboxRank = WORK_STATUS_RANK[outboxStatus];
  if (cloudRank >= outboxRank) {
    return {
      workStatus: cloud.workStatus ?? outbox?.workStatus,
      workStatusLabel: cloud.workStatusLabel ?? outbox?.workStatusLabel,
      workStatusUpdatedAt: cloud.workStatusUpdatedAt ?? outbox?.workStatusUpdatedAt,
    };
  }
  return {
    workStatus: outbox?.workStatus,
    workStatusLabel: outbox?.workStatusLabel,
    workStatusUpdatedAt: outbox?.workStatusUpdatedAt,
  };
};

const resolvePaymentMethod = (value: unknown): PaymentMethod =>
  value === 'qr' ? 'qr' : DEFAULT_PAYMENT_METHOD;

const createEmptyOrder = (): OrderState => ({
  items: [],
  deliveryType: 'city',
  deliveryKm: 0,
  globalInstall: true,
  includeMeasurementFee: true,
  paymentMethod: DEFAULT_PAYMENT_METHOD,
  orderDiscountPercent: 0,
  customer: { name: '', phone: '', address: '' },
});

const loadInitialActiveUpcomingId = (): string | null => {
  try {
    const raw = localStorage.getItem(ACTIVE_UPCOMING_ID_KEY);
    if (!raw || !raw.trim()) return null;
    return raw;
  } catch {
    return null;
  }
};

const loadInitialOrder = (): OrderState => {
  const emptyOrder = createEmptyOrder();

  try {
    const savedOrder = localStorage.getItem('measurer_current_order');
    if (!savedOrder) return emptyOrder;

    const parsed = JSON.parse(savedOrder) as Partial<OrderState>;
    const discount = parsed.orderDiscountPercent;
    const validDiscount = discount === 5 || discount === 10 ? discount : 0;
    const paymentMethod = resolvePaymentMethod((parsed as { paymentMethod?: unknown }).paymentMethod);

    return {
      ...emptyOrder,
      ...parsed,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      customer: {
        name: parsed.customer?.name ?? '',
        phone: parsed.customer?.phone ?? '',
        address: parsed.customer?.address ?? '',
      },
      deliveryType: parsed.deliveryType ?? emptyOrder.deliveryType,
      deliveryKm: Number(parsed.deliveryKm) || 0,
      globalInstall: parsed.globalInstall !== false,
      includeMeasurementFee: parsed.includeMeasurementFee !== false,
      paymentMethod,
      orderDiscountPercent: validDiscount,
      generalComment: parsed.generalComment,
    };
  } catch (error) {
    console.warn('[DRAFT] failed to restore measurer_current_order', error);
    return emptyOrder;
  }
};

const resolveArchiveWorkStatus = (existing?: ArchivedOrder | null): Pick<ArchivedOrder, 'workStatus' | 'workStatusLabel'> => {
  const status: OrderWorkStatus = existing?.workStatus ?? 'waiting';
  return {
    workStatus: status,
    workStatusLabel: existing?.workStatusLabel || WORK_STATUS_LABELS[status],
  };
};

const LogoIcon = ({ className = "w-12 h-12" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {[
      { x: 28, y: 15 }, { x: 56, y: 15 },
      { x: 14, y: 38 }, { x: 42, y: 38 }, { x: 70, y: 38 },
      { x: 28, y: 61 }, { x: 56, y: 61 }
    ].map((pos, i) => (
      <path
        key={i}
        d={`M${pos.x} ${pos.y} L${pos.x + 16} ${pos.y + 12} L${pos.x} ${pos.y + 24} L${pos.x + 6} ${pos.y + 12} Z`}
        fill="#f39200"
      />
    ))}
  </svg>
);

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('splash');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [selectedProductType, setSelectedProductType] = useState<ProductType | null>(null);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [editingArchiveOrderId, setEditingArchiveOrderId] = useState<string | null>(null);
  const [activeUpcomingId, setActiveUpcomingId] = useState<string | null>(() => loadInitialActiveUpcomingId());
  
  // State for Prices
  const [prices, setPrices] = useState(DEFAULT_PRICES);

  // State for Current Order (Draft)
  const [order, setOrder] = useState<OrderState>(() => loadInitialOrder());
  
  // State for Archive (Cloud Synchronized)
  const [archive, setArchive] = useState<ArchivedOrder[]>([]);
  const [cloudArchive, setCloudArchive] = useState<ArchivedOrder[]>([]);
  const [pendingArchiveOutbox, setPendingArchiveOutbox] = useState<PendingArchiveOutboxEntry[]>([]);

  const isMountedRef = useRef(true);
  const mainContentRef = useRef<HTMLElement | null>(null);
  const pendingArchiveOutboxRef = useRef<PendingArchiveOutboxEntry[]>([]);
  const isSyncingOutboxRef = useRef(false);
  const shouldRerunOutboxSyncRef = useRef(false);
  const isArchiveSaveInProgressRef = useRef(false);
  const lastArchiveSaveAtRef = useRef(0);
  const cartScrollResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDraftChanges = useMemo(() => {
    const hasItems = order.items.length > 0;
    const hasCustomer = Boolean(
      order.customer?.name?.trim() ||
      order.customer?.phone?.trim() ||
      order.customer?.address?.trim()
    );
    const hasComment = Boolean(order.generalComment?.trim());
    const hasDeliveryChanges = order.deliveryType !== 'city' || Number(order.deliveryKm) > 0;
    const hasInstallChanges = order.globalInstall !== true || order.installOverride != null;
    const hasDiscount = (order.orderDiscountPercent ?? 0) !== 0;
    const hasMeasurementFlagChange = order.includeMeasurementFee === false;
    const hasPaymentMethodChange = (order.paymentMethod ?? DEFAULT_PAYMENT_METHOD) !== DEFAULT_PAYMENT_METHOD;
    return (
      hasItems ||
      hasCustomer ||
      hasComment ||
      hasDeliveryChanges ||
      hasInstallChanges ||
      hasDiscount ||
      hasMeasurementFlagChange ||
      hasPaymentMethodChange
    );
  }, [order]);

  const scrollMainContentToTop = () => {
    const main = mainContentRef.current;
    if (main) {
      main.scrollTop = 0;
      main.scrollTo({ top: 0, behavior: 'auto' });
    }
    window.scrollTo(0, 0);
  };

  const clearEditingArchiveContext = () => {
    setEditingArchiveOrderId(null);
    localStorage.removeItem(EDITING_ARCHIVE_ORDER_ID_KEY);
    localStorage.removeItem(EDITING_ARCHIVE_ORDER_DATE_KEY);
  };

  const clearActiveUpcomingId = () => {
    setActiveUpcomingId(null);
    localStorage.removeItem(ACTIVE_UPCOMING_ID_KEY);
    localStorage.removeItem(ACTIVE_UPCOMING_FLOW_KEY);
  };

  const persistActiveUpcomingId = (upcomingId?: string) => {
    if (upcomingId?.trim()) {
      setActiveUpcomingId(upcomingId);
      localStorage.setItem(ACTIVE_UPCOMING_ID_KEY, upcomingId);
      localStorage.setItem(ACTIVE_UPCOMING_FLOW_KEY, '1');
      return;
    }
    clearActiveUpcomingId();
  };

  const isUpcomingMeasurementFlowActive = (): boolean =>
    localStorage.getItem(ACTIVE_UPCOMING_FLOW_KEY) === '1';

  const persistEditingArchiveContext = (archiveId: string, archiveDate?: string) => {
    setEditingArchiveOrderId(archiveId);
    localStorage.setItem(EDITING_ARCHIVE_ORDER_ID_KEY, archiveId);
    if (archiveDate && archiveDate.trim()) {
      localStorage.setItem(EDITING_ARCHIVE_ORDER_DATE_KEY, archiveDate);
    } else {
      localStorage.removeItem(EDITING_ARCHIVE_ORDER_DATE_KEY);
    }
  };

  const readPendingArchiveOutbox = (): PendingArchiveOutboxEntry[] => {
    const raw = localStorage.getItem(PENDING_ARCHIVE_OUTBOX_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      let didNormalize = false;
      const normalized = parsed
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const archiveId = typeof entry.archiveId === 'string' ? entry.archiveId : '';
          const createdAt = Number(entry.createdAt) || Date.now();
          // После перезапуска неизвестно, завершился ли syncing, поэтому переводим в pending.
          const parsedStatus: OutboxStatus = entry.status === 'synced' || entry.status === 'error' || entry.status === 'syncing'
            ? entry.status
            : 'pending';
          const status: OutboxStatus = parsedStatus === 'syncing' ? 'pending' : parsedStatus;
          const operation: OutboxOperation = entry.operation === 'delete' ? 'delete' : 'upsert';
          const rawOrder = entry.order as ArchivedOrder | undefined;
          if (!archiveId) return null;
          if (operation === 'upsert' && (!rawOrder || typeof rawOrder !== 'object')) return null;
          const order = rawOrder
            ? {
                ...rawOrder,
                archiveId: rawOrder.archiveId || archiveId,
              } as ArchivedOrder
            : undefined;
          const hasEntrySyncToken = typeof entry.syncToken === 'string' && entry.syncToken.length > 0;
          const hasOrderSyncToken = typeof order?.syncToken === 'string' && (order?.syncToken?.length ?? 0) > 0;
          const syncToken = hasEntrySyncToken
            ? entry.syncToken as string
            : hasOrderSyncToken
              ? order!.syncToken as string
              : `${archiveId}:${createdAt}`;
          const normalizedOrder = order
            ? {
                ...order,
                syncToken,
              }
            : undefined;
          if (!hasEntrySyncToken || (order && !hasOrderSyncToken) || (order?.syncToken && order.syncToken !== syncToken)) {
            didNormalize = true;
          }
          return {
            archiveId,
            operation,
            order: normalizedOrder,
            syncToken,
            createdAt,
            status,
            lastError: typeof entry.lastError === 'string' ? entry.lastError : undefined,
          } as PendingArchiveOutboxEntry;
        })
        .filter(Boolean) as PendingArchiveOutboxEntry[];
      if (didNormalize) {
        localStorage.setItem(PENDING_ARCHIVE_OUTBOX_KEY, JSON.stringify(normalized));
      }
      return normalized;
    } catch (e) {
      console.error('Failed to parse pending archive outbox', e);
      return [];
    }
  };

  const persistPendingArchiveOutbox = (
    updater: (prev: PendingArchiveOutboxEntry[]) => PendingArchiveOutboxEntry[]
  ): PendingArchiveOutboxEntry[] => {
    const next = updater(pendingArchiveOutboxRef.current);
    pendingArchiveOutboxRef.current = next;
    setPendingArchiveOutbox(next);
    localStorage.setItem(PENDING_ARCHIVE_OUTBOX_KEY, JSON.stringify(next));
    return next;
  };

  const generateArchiveId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const mergeCloudAndPendingArchive = (
    cloud: ArchivedOrder[],
    outbox: PendingArchiveOutboxEntry[]
  ): ArchivedOrder[] => {
    const byArchiveId = new Map<string, ArchivedOrder>();
    const outboxById = new Map(outbox.map((entry) => [entry.archiveId, entry]));

    for (const cloudOrder of cloud) {
      const outboxEntry = outboxById.get(cloudOrder.archiveId);
      const hasActiveOutbox = Boolean(outboxEntry && ACTIVE_OUTBOX_STATUSES.includes(outboxEntry.status));

      if (outboxEntry?.operation === 'delete' && hasActiveOutbox) {
        // Локально удалённая запись не должна отображаться, даже если в cloud есть старая версия.
        continue;
      }

      if (outboxEntry?.operation === 'upsert' && outboxEntry.order && hasActiveOutbox) {
        const mergedWorkStatus = mergeWorkStatusFields(cloudOrder, outboxEntry.order);
        byArchiveId.set(cloudOrder.archiveId, {
          ...cloudOrder,
          ...outboxEntry.order,
          ...mergedWorkStatus,
          archiveId: cloudOrder.archiveId,
          firestoreId: (cloudOrder as { firestoreId?: string }).firestoreId,
          hasPendingWrites: true,
          syncStatus: outboxEntry.status === 'error' ? 'error' : 'pending',
          syncError: outboxEntry.lastError,
        });
        continue;
      }

      const syncStatus = cloudOrder.hasPendingWrites
        ? 'pending'
        : outboxEntry?.status === 'error'
          ? 'error'
          : undefined;
      byArchiveId.set(cloudOrder.archiveId, {
        ...cloudOrder,
        syncStatus,
        syncError: outboxEntry?.lastError,
      });
    }

    for (const outboxEntry of outbox) {
      if (byArchiveId.has(outboxEntry.archiveId)) continue;
      if (outboxEntry.operation !== 'upsert' || !outboxEntry.order) continue;
      byArchiveId.set(outboxEntry.archiveId, {
        ...outboxEntry.order,
        archiveId: outboxEntry.archiveId,
        hasPendingWrites: true,
        syncStatus: outboxEntry.status === 'error' ? 'error' : 'pending',
        syncError: outboxEntry.lastError,
      });
    }

    const sorted = [...byArchiveId.values()].sort((a, b) => {
      const aTs = Number(a.archiveId.split('-')[0]) || 0;
      const bTs = Number(b.archiveId.split('-')[0]) || 0;
      return bTs - aTs;
    });

    return sorted;
  };

  const sortArchiveByArchiveIdDesc = (orders: ArchivedOrder[]): ArchivedOrder[] =>
    [...orders].sort((a, b) => {
      const aTs = Number(a.archiveId.split('-')[0]) || 0;
      const bTs = Number(b.archiveId.split('-')[0]) || 0;
      return bTs - aTs;
    });

  const filterArchiveForUser = (
    orders: ArchivedOrder[],
    profile: UserProfile | null
  ): ArchivedOrder[] => {
    if (!profile) return [];
    return orders.filter((order) => order.measurerId === profile.uid);
  };

  const filterPendingArchiveOutboxForUser = (
    outbox: PendingArchiveOutboxEntry[],
    profile: UserProfile | null
  ): PendingArchiveOutboxEntry[] => {
    if (!profile) return [];
    return outbox.filter((entry) => entry.order?.measurerId === profile.uid);
  };

  const syncPendingArchiveOutbox = async (archiveId?: string) => {
    if (isSyncingOutboxRef.current) {
      shouldRerunOutboxSyncRef.current = true;
      return;
    }
    isSyncingOutboxRef.current = true;
    try {
      const makeEntrySignature = (entry: PendingArchiveOutboxEntry): string => (
        `${entry.archiveId}:${entry.operation}:${entry.syncToken || ''}:${entry.createdAt}`
      );
      const hasEntriesToSync = (entries: PendingArchiveOutboxEntry[]): boolean => (
        entries.some((entry) => entry.status === 'pending' || entry.status === 'error' || entry.status === 'syncing')
      );

      const MAX_SYNC_CYCLES = 8;
      let currentArchiveId = archiveId;
      let cycle = 0;

      while (cycle < MAX_SYNC_CYCLES) {
        cycle += 1;
        shouldRerunOutboxSyncRef.current = false;
        const processedInCycle = new Set<string>();
        const processedByArchiveInCycle = new Set<string>();
        let pass = 0;
        const MAX_PASSES = 10;

        while (pass < MAX_PASSES) {
          pass += 1;
          const entries = pendingArchiveOutboxRef.current.filter((entry) => {
            if (currentArchiveId && entry.archiveId !== currentArchiveId) return false;
            if (processedByArchiveInCycle.has(entry.archiveId)) return false;
            return entry.status === 'pending' || entry.status === 'error';
          });

          if (entries.length === 0) break;

          for (const entry of entries) {
            processedByArchiveInCycle.add(entry.archiveId);
            processedInCycle.add(makeEntrySignature(entry));
            persistPendingArchiveOutbox((prev) =>
              prev.map((candidate) =>
                candidate.archiveId === entry.archiveId
                  ? { ...candidate, status: 'syncing', lastError: undefined }
                  : candidate
              )
            );

            try {
              if (entry.operation === 'delete') {
                console.log(`[OUTBOX] syncing delete for archiveId ${entry.archiveId}`);
                await deleteDoc(doc(db, 'measurements', entry.archiveId));
                persistPendingArchiveOutbox((prev) =>
                  prev.filter((candidate) => candidate.archiveId !== entry.archiveId)
                );
                console.log(`[OUTBOX] removed resolved outbox entry for archiveId ${entry.archiveId}`);
              } else {
                if (!entry.order) {
                  throw new Error('Отсутствуют данные заказа для синхронизации');
                }

                const serverSnap = await getDoc(doc(db, 'measurements', entry.archiveId));
                const serverData = serverSnap.exists() ? serverSnap.data() : null;
                const localStatus = entry.order.workStatus ?? 'waiting';

                if (
                  serverData &&
                  localStatus === 'waiting' &&
                  isAdvancedWorkStatus(serverData.workStatus)
                ) {
                  console.warn(`[OUTBOX] skipped stale waiting update for archiveId ${entry.archiveId}`);
                  const confirmedSyncToken =
                    typeof serverData.syncToken === 'string' ? serverData.syncToken : undefined;
                  const canRemove = Boolean(entry.syncToken && confirmedSyncToken === entry.syncToken);

                  if (canRemove) {
                    persistPendingArchiveOutbox((prev) =>
                      prev.filter((candidate) => candidate.archiveId !== entry.archiveId)
                    );
                    console.log(`[OUTBOX] removed resolved outbox entry for archiveId ${entry.archiveId}`);
                  } else {
                    const serverPatch = pickOutboxStatusGuardFields(serverData as Record<string, unknown>);
                    persistPendingArchiveOutbox((prev) =>
                      prev.map((candidate) => {
                        if (
                          candidate.archiveId !== entry.archiveId ||
                          candidate.operation !== 'upsert' ||
                          !candidate.order
                        ) {
                          return candidate;
                        }
                        return {
                          ...candidate,
                          status: 'pending',
                          lastError: undefined,
                          order: {
                            ...candidate.order,
                            ...serverPatch,
                          },
                        };
                      })
                    );
                    console.log(`[OUTBOX] resolved stale outbox entry for archiveId ${entry.archiveId}`);
                  }
                  continue;
                }

                console.log(`[OUTBOX] syncing upsert for archiveId ${entry.archiveId}`);
                const orderPayload = JSON.parse(JSON.stringify(entry.order)) as ArchivedOrder;
                if ((orderPayload.workStatus ?? 'waiting') === 'waiting') {
                  delete orderPayload.workStatus;
                  delete orderPayload.workStatusLabel;
                  delete orderPayload.workStatusUpdatedAt;
                }
                await setDoc(doc(db, 'measurements', entry.archiveId), orderPayload, { merge: true });
                persistPendingArchiveOutbox((prev) =>
                  prev.map((candidate) =>
                    candidate.archiveId === entry.archiveId
                      ? { ...candidate, status: 'pending', lastError: undefined }
                      : candidate
                  )
                );
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
              persistPendingArchiveOutbox((prev) =>
                prev.map((candidate) =>
                  candidate.archiveId === entry.archiveId
                    ? { ...candidate, status: 'error', lastError: message }
                    : candidate
                )
              );
            }
          }
        }

        currentArchiveId = undefined;
        const activeEntries = pendingArchiveOutboxRef.current.filter((entry) =>
          entry.status === 'pending' || entry.status === 'error' || entry.status === 'syncing'
        );
        const hasUnprocessedActiveEntry = activeEntries.some((entry) => !processedInCycle.has(makeEntrySignature(entry)));
        const shouldRunAgain = shouldRerunOutboxSyncRef.current || (hasEntriesToSync(activeEntries) && hasUnprocessedActiveEntry);
        if (!shouldRunAgain) break;
      }
    } finally {
      isSyncingOutboxRef.current = false;
    }
  };

  useEffect(() => {
    return subscribeAuthState((user) => {
      if (!user) {
        setUserProfile(null);
        setAuthStatus('anonymous');
        return;
      }

      void (async () => {
        setAuthStatus('loading');
        const profile = await getUserProfile(user.uid);

        if (!profile) {
          await signOutUser();
          setUserProfile(null);
          setAuthError('Профиль пользователя не найден. Обратитесь к администратору.');
          setAuthStatus('anonymous');
          return;
        }

        if (profile.active !== true) {
          await signOutUser();
          setUserProfile(null);
          setAuthError('Пользователь отключен. Обратитесь к администратору.');
          setAuthStatus('anonymous');
          return;
        }

        setUserProfile(profile);
        setAuthError(null);
        setAuthStatus('authenticated');
      })();
    });
  }, []);

  // 1. Initial Data Loading (Local & Cloud)
  useEffect(() => {
    isMountedRef.current = true;
    const initialOutbox = readPendingArchiveOutbox();
    pendingArchiveOutboxRef.current = initialOutbox;
    setPendingArchiveOutbox(initialOutbox);

    // Restore editing-archive context (draft order itself is loaded via useState lazy init)
    const savedEditingArchiveOrderId = localStorage.getItem(EDITING_ARCHIVE_ORDER_ID_KEY);
    if (localStorage.getItem('measurer_current_order') && savedEditingArchiveOrderId && order.items.length > 0) {
      setEditingArchiveOrderId(savedEditingArchiveOrderId);
    } else {
      localStorage.removeItem(EDITING_ARCHIVE_ORDER_ID_KEY);
      localStorage.removeItem(EDITING_ARCHIVE_ORDER_DATE_KEY);
    }

    const handleOnline = () => {
      void syncPendingArchiveOutbox();
    };
    window.addEventListener('online', handleOnline);
    if (initialOutbox.length > 0) {
      void syncPendingArchiveOutbox();
    }

    // Splash Timer
    if (currentScreen === 'splash') {
      const timer = setTimeout(() => {
        setCurrentScreen('menu');
      }, 3000);
      return () => {
        isMountedRef.current = false;
        clearTimeout(timer);
        window.removeEventListener('online', handleOnline);
      };
    }

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !userProfile) {
      return;
    }

    // FIREBASE PRICES SYNC (onSnapshot — реальное время для всех устройств)
    const pricesRef = doc(db, 'config', 'prices');
    const unsubPrices = onSnapshot(
      pricesRef,
      (snap) => {
        if (snap.exists()) {
          const cloudPrices = snap.data() as typeof DEFAULT_PRICES;
          setPrices(cloudPrices);
          // Кэшируем локально для офлайн-режима
          localStorage.setItem('measurer_prices', JSON.stringify(cloudPrices));
        } else {
          // Документ ещё не существует — публикуем дефолтный прайс из constants.ts
          const fallback = (() => {
            const cached = localStorage.getItem('measurer_prices');
            if (cached) { try { return JSON.parse(cached); } catch { /* noop */ } }
            return DEFAULT_PRICES;
          })();
          setDoc(pricesRef, fallback).catch(console.error);
        }
      },
      () => {
        // Офлайн: тихо берём последний кэш из localStorage
        const cached = localStorage.getItem('measurer_prices');
        if (cached) {
          try { setPrices(JSON.parse(cached)); } catch { /* noop */ }
        }
      }
    );

    // FIREBASE ARCHIVE SYNC (onSnapshot) — только заказы текущего замерщика
    const q = query(
      collection(db, 'measurements'),
      where('measurerId', '==', userProfile.uid)
    );
    const unsubArchive = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const docs = sortArchiveByArchiveIdDesc(
          snapshot.docs.map(d => normalizeArchiveOrder({
            ...d.data(),
            hasPendingWrites: d.metadata.hasPendingWrites,
          } as Record<string, unknown> & Partial<ArchivedOrder>, d.id))
        );
        setCloudArchive(docs);

        const confirmedByArchiveId = new Map<string, ArchivedOrder>();
        for (const docItem of docs) {
          if (docItem.hasPendingWrites === false && docItem.archiveId) {
            confirmedByArchiveId.set(docItem.archiveId, docItem);
          }
        }

        if (confirmedByArchiveId.size > 0) {
          persistPendingArchiveOutbox((prev) =>
            prev.filter((entry) => {
              // delete-операции удаляются из outbox после успешного deleteDoc в syncPendingArchiveOutbox.
              if (entry.operation === 'delete') return true;
              const confirmedDoc = confirmedByArchiveId.get(entry.archiveId);
              if (!confirmedDoc) return true;
              // Удаляем outbox только когда сервер подтвердил именно текущую pending-версию.
              const confirmedSyncToken = typeof confirmedDoc.syncToken === 'string' ? confirmedDoc.syncToken : undefined;
              return !entry.syncToken || confirmedSyncToken !== entry.syncToken;
            })
          );
        }
      }
    );

    return () => {
      unsubPrices();
      unsubArchive();
    };
  }, [authStatus, userProfile?.uid]);

  // 2. Save draft order to localStorage
  useEffect(() => {
    localStorage.setItem('measurer_current_order', JSON.stringify(order));
  }, [order]);

  useEffect(() => {
    setArchive(
      mergeCloudAndPendingArchive(
        filterArchiveForUser(cloudArchive, userProfile),
        filterPendingArchiveOutboxForUser(pendingArchiveOutbox, userProfile)
      )
    );
  }, [cloudArchive, pendingArchiveOutbox, userProfile]);

  useEffect(() => {
    if (currentScreen !== 'cart') return;
    requestAnimationFrame(() => scrollMainContentToTop());
    if (cartScrollResetTimerRef.current) clearTimeout(cartScrollResetTimerRef.current);
    cartScrollResetTimerRef.current = setTimeout(() => {
      scrollMainContentToTop();
      cartScrollResetTimerRef.current = null;
    }, 0);
    return () => {
      if (cartScrollResetTimerRef.current) {
        clearTimeout(cartScrollResetTimerRef.current);
        cartScrollResetTimerRef.current = null;
      }
    };
  }, [currentScreen]);

  useEffect(() => {
    if (currentScreen !== 'products') return;
    const resetScroll = () => scrollMainContentToTop();
    requestAnimationFrame(resetScroll);
    const t1 = setTimeout(resetScroll, 0);
    const t2 = setTimeout(resetScroll, 50);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [currentScreen]);

  const savePrices = async (newPrices: typeof DEFAULT_PRICES) => {
    // Моментально обновляем UI и кэш
    setPrices(newPrices);
    localStorage.setItem('measurer_prices', JSON.stringify(newPrices));
    // Публикуем в облако — все устройства получат обновление через onSnapshot
    try {
      await setDoc(doc(db, 'config', 'prices'), newPrices);
    } catch (e) {
      console.error('Prices cloud sync failed, saved locally only', e);
      alert('Цены сохранены локально. Синхронизация с облаком не удалась — проверьте интернет.');
    }
  };

  const cartCount = useMemo(() => order.items.length, [order.items]);

  const navigateToMenu = () => {
    clearEditingArchiveContext();
    setCurrentScreen('menu');
  };
  const navigateToProducts = (preserveArchiveContext = false) => {
    if (!preserveArchiveContext) {
      clearEditingArchiveContext();
    }
    setCurrentScreen('products');
  };
  const navigateToCalc = (type: ProductType) => {
    setEditingItem(null);
    setSelectedProductType(type);
    setCurrentScreen('calc');
  };
  const navigateToCart = () => {
    setCurrentScreen('cart');
    requestAnimationFrame(() => {
      scrollMainContentToTop();
    });
  };
  const navigateToArchive = () => setCurrentScreen('archive');
  const navigateToUpcoming = () => setCurrentScreen('upcoming');
  const navigateToInProgress = () => setCurrentScreen('inProgress');

  /** Ручной замер без заявки: сброс связи с upcoming и переход к выбору изделий. */
  const startManualMeasurement = () => {
    clearActiveUpcomingId();
    navigateToProducts();
  };

  /** Замер из забронированной заявки «Мои замеры». */
  const startUpcomingMeasurement = (
    customer: { name: string; phone: string; address: string },
    upcomingId?: string
  ) => {
    persistActiveUpcomingId(upcomingId);
    updateOrder({
      customer,
      generalComment: '', // Очищаем комментарий, чтобы не тянуть данные из таблицы
    });
    navigateToProducts();
  };
  
  const handleAdminLogin = () => {
    if (adminPassword === "3673108") {
      setCurrentScreen('admin');
      setShowPasswordModal(false);
      setAdminPassword('');
      setLoginError(false);
    } else {
      setLoginError(true);
      setAdminPassword('');
    }
  };

  const handleLogout = async () => {
    await signOutUser();
    setUserProfile(null);
    setAuthError(null);
  };

  const addToCart = (item: CartItem) => {
    setOrder(prev => {
      const existingIndex = prev.items.findIndex(i => i.id === item.id);
      if (existingIndex > -1) {
        const newItems = [...prev.items];
        newItems[existingIndex] = item;
        return { ...prev, items: newItems };
      }
      return { ...prev, items: [...prev.items, item] };
    });
    setEditingItem(null);
    if (editingArchiveOrderId) {
      navigateToCart();
      return;
    }
    navigateToProducts();
  };

  const handleEditItem = (item: CartItem) => {
    setEditingItem(item);
    setSelectedProductType(item.type);
    setCurrentScreen('calc');
  };

  const removeFromCart = (id: string) => {
    setOrder(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
  };

  const handleAddItemToEditedArchive = () => {
    if (!editingArchiveOrderId) return;
    setEditingItem(null);
    setSelectedProductType(null);
    navigateToProducts(true);
  };

  const updateOrder = (updates: Partial<OrderState>) => {
    setOrder(prev => ({ ...prev, ...updates }));
  };

  const resetOrderState = () => {
    clearEditingArchiveContext();
    clearActiveUpcomingId();
    setOrder({
      items: [],
      deliveryType: 'city',
      deliveryKm: 0,
      globalInstall: true,
      includeMeasurementFee: true,
      paymentMethod: DEFAULT_PAYMENT_METHOD,
      orderDiscountPercent: 0,
      customer: { name: '', phone: '', address: '' }
    });
  };

  const startArchiveEdit = (archivedOrder: ArchivedOrder) => {
    if (hasDraftChanges) {
      alert('Нельзя редактировать архивный замер, пока есть активный черновик в корзине. Сначала завершите или отмените текущий замер.');
      return;
    }

    const draftFromArchive: OrderState = {
      items: archivedOrder.items ?? [],
      deliveryType: archivedOrder.deliveryType ?? 'city',
      deliveryKm: Number(archivedOrder.deliveryKm) || 0,
      globalInstall: archivedOrder.globalInstall !== false,
      includeMeasurementFee: archivedOrder.includeMeasurementFee !== false,
      paymentMethod: resolvePaymentMethod((archivedOrder as { paymentMethod?: unknown }).paymentMethod),
      orderDiscountPercent: archivedOrder.orderDiscountPercent === 5 || archivedOrder.orderDiscountPercent === 10
        ? archivedOrder.orderDiscountPercent
        : 0,
      generalComment: archivedOrder.generalComment,
      customer: archivedOrder.customer ?? { name: '', phone: '', address: '' },
      installOverride: archivedOrder.installOverride ?? null,
    };

    clearActiveUpcomingId();
    persistEditingArchiveContext(archivedOrder.archiveId, archivedOrder.date);
    setEditingItem(null);
    setSelectedProductType(null);
    setOrder(draftFromArchive);
    navigateToCart();
  };

  const clearOrder = () => {
    const wasEditingArchive = Boolean(editingArchiveOrderId);
    resetOrderState();
    clearEditingArchiveContext();
    if (currentScreen === 'cart' && wasEditingArchive) {
      navigateToArchive();
      return;
    }
    navigateToMenu();
  };

  const applyArchiveWorkStatusUpdate = (
    archiveId: string,
    workStatus: OrderWorkStatus,
    workStatusLabel: string,
    paymentUpdate?: ArchiveWorkStatusPaymentUpdate
  ) => {
    const patch = {
      workStatus,
      workStatusLabel,
      workStatusUpdatedAt: new Date().toISOString(),
      ...(paymentUpdate ?? {}),
    };

    persistPendingArchiveOutbox((prev) => {
      const hasOutboxEntry = prev.some(
        (entry) => entry.archiveId === archiveId && entry.operation === 'upsert' && entry.order
      );
      if (!hasOutboxEntry) {
        console.log(`[OUTBOX] workStatus patch skipped for archiveId ${archiveId} (no local outbox entry)`);
        return prev;
      }
      console.log(`[OUTBOX] updated local outbox workStatus for archiveId ${archiveId} -> ${workStatus}`);
      return prev.map((entry) =>
        entry.archiveId === archiveId && entry.operation === 'upsert' && entry.order
          ? {
              ...entry,
              status: 'pending',
              lastError: undefined,
              order: {
                ...entry.order,
                ...patch,
              },
            }
          : entry
      );
    });

    setCloudArchive((prev) =>
      prev.map((order) => (order.archiveId === archiveId ? { ...order, ...patch } : order))
    );
  };

  const refreshArchiveFromCloud = async () => {
    if (!userProfile?.uid) return;
    try {
      await syncPendingArchiveOutbox();
      const q = query(
        collection(db, 'measurements'),
        where('measurerId', '==', userProfile.uid)
      );
      const snapshot = await getDocsFromServer(q);
      const docs = sortArchiveByArchiveIdDesc(
        snapshot.docs.map((d) =>
          normalizeArchiveOrder(
            {
              ...d.data(),
              hasPendingWrites: d.metadata.hasPendingWrites,
            } as Record<string, unknown> & Partial<ArchivedOrder>,
            d.id
          )
        )
      );
      setCloudArchive(docs);
    } catch (e) {
      console.error('refreshArchiveFromCloud failed', e);
    }
  };

  const completeUpcomingMeasurement = async (upcomingId: string, archiveId: string): Promise<void> => {
    const measurerUid = userProfile?.uid;
    if (!measurerUid) {
      console.warn('[UPCOMING] completeUpcomingMeasurement skipped: no measurer uid');
      return;
    }

    const ref = doc(db, 'upcoming_measurements', upcomingId);

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) {
          console.warn(`[UPCOMING] completeUpcomingMeasurement: document ${upcomingId} not found`);
          return;
        }

        const data = snap.data();
        if (data?.reservationStatus !== 'reserved') {
          console.warn(
            `[UPCOMING] completeUpcomingMeasurement: reservationStatus is not reserved for ${upcomingId}`
          );
          return;
        }
        if (data?.reservedByMeasurerId !== measurerUid) {
          console.warn(
            `[UPCOMING] completeUpcomingMeasurement: not reserved by current measurer for ${upcomingId}`
          );
          return;
        }

        transaction.update(ref, {
          reservationStatus: 'completed',
          completedAt: serverTimestamp(),
          completedByMeasurerId: measurerUid,
          archiveId,
        });
      });
    } catch (error) {
      console.warn('[UPCOMING] completeUpcomingMeasurement failed', error);
    }
  };

  // CLOUD SAVE FUNCTION
  const saveToArchive = (): boolean => {
    const now = Date.now();
    if (now - lastArchiveSaveAtRef.current < 800) {
      return false;
    }
    if (isArchiveSaveInProgressRef.current) {
      return false;
    }
    if (order.items.length === 0) return false;
    isArchiveSaveInProgressRef.current = true;
    lastArchiveSaveAtRef.current = now;
    const syncToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const persistedEditingDate = localStorage.getItem(EDITING_ARCHIVE_ORDER_DATE_KEY);
      const archiveId = editingArchiveOrderId || generateArchiveId();
      const isNewArchiveSave = !editingArchiveOrderId;
      const upcomingIdToComplete =
        isNewArchiveSave && activeUpcomingId && isUpcomingMeasurementFlowActive()
          ? activeUpcomingId
          : null;
      const existingArchivedOrder = editingArchiveOrderId
        ? archive.find((entry) => entry.archiveId === editingArchiveOrderId)
          || cloudArchive.find((entry) => entry.archiveId === editingArchiveOrderId)
          || pendingArchiveOutboxRef.current.find((entry) => entry.archiveId === editingArchiveOrderId)?.order
        : null;
      const workStatusContext = resolveArchiveWorkStatus(existingArchivedOrder);
      const newArchivedOrder = {
        ...order,
        archiveId,
        syncToken,
        date: existingArchivedOrder?.date || persistedEditingDate || new Date().toLocaleString('ru-RU'),
        ...workStatusContext,
        ...(userProfile
          ? {
              measurerId: userProfile.uid,
              measurerName: userProfile.displayName,
            }
          : {}),
        ...(upcomingIdToComplete ? { upcomingId: upcomingIdToComplete } : {}),
      };

      // Firestore does not accept 'undefined' values.
      // JSON.stringify removes keys with undefined values recursively.
      const sanitizedOrder = JSON.parse(JSON.stringify(newArchivedOrder)) as ArchivedOrder;

      // Сначала сохраняем в локальный outbox, чтобы не потерять замер при закрытии приложения.
      persistPendingArchiveOutbox((prev) => {
        const existingIndex = prev.findIndex((entry) => entry.archiveId === archiveId);
        const nextEntry: PendingArchiveOutboxEntry = {
          archiveId,
          operation: 'upsert',
          order: sanitizedOrder,
          syncToken: sanitizedOrder.syncToken,
          createdAt: Date.now(),
          status: 'pending',
        };
        if (existingIndex === -1) return [...prev, nextEntry];
        const next = [...prev];
        next[existingIndex] = nextEntry;
        return next;
      });
      // Очищаем черновик синхронно сразу после успешной записи в outbox.
      localStorage.removeItem('measurer_current_order');
      localStorage.removeItem(EDITING_ARCHIVE_ORDER_ID_KEY);
      localStorage.removeItem(EDITING_ARCHIVE_ORDER_DATE_KEY);

      // UI не блокируем: мгновенно очищаем корзину и возвращаем в меню
      if (isMountedRef.current) {
        const wasEditingArchive = Boolean(editingArchiveOrderId);
        resetOrderState();
        if (wasEditingArchive) {
          navigateToArchive();
        } else {
          navigateToMenu();
        }
      }

      // Пытаемся синхронизировать сразу, но без блокировки UI.
      void syncPendingArchiveOutbox(archiveId);

      if (upcomingIdToComplete && userProfile?.uid) {
        clearActiveUpcomingId();
        void completeUpcomingMeasurement(upcomingIdToComplete, archiveId);
      }

      return true;
    } catch (e) {
      console.error('Failed to save pending archive to local outbox', e);
      if (isMountedRef.current) {
        alert('Не удалось сохранить замер локально. Проверьте свободное место на устройстве и повторите попытку.');
      }
      return false;
    } finally {
      isArchiveSaveInProgressRef.current = false;
    }
  };

  // CLOUD DELETE FUNCTION
  const deleteFromArchive = async (id: string) => {
    const orderToDelete = archive.find(o => (o as any).firestoreId === id || o.archiveId === id);
    if (!orderToDelete) return;
    const archiveId = orderToDelete.archiveId;
    const firestoreId = (orderToDelete as any).firestoreId as string | undefined;

    // Для offline-only записей удаляем из outbox сразу; для cloud-записей ставим delete-операцию в outbox.
    persistPendingArchiveOutbox((prev) => {
      const filtered = prev.filter((entry) => entry.archiveId !== archiveId);
      const shouldQueueDelete = Boolean(firestoreId);
      if (!shouldQueueDelete) return filtered;
      return [
        ...filtered,
        {
          archiveId,
          operation: 'delete',
          createdAt: Date.now(),
          status: 'pending',
        },
      ];
    });

    if (firestoreId) {
      void syncPendingArchiveOutbox(archiveId);
    }
  };

  if (currentScreen === 'splash') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center max-w-md mx-auto shadow-xl p-6">
        <div className="flex flex-col items-center">
           <LogoIcon className="w-28 h-28 mb-4" />
           <div className="flex flex-col items-center text-center">
             <span className="text-3xl font-bold tracking-tight text-gray-700 leading-none">СУПЕР</span>
             <span className="text-4xl font-black tracking-tight text-[#f39200] leading-tight">МОСКИТКА</span>
             <div className="mt-2 h-[1px] w-32 bg-gray-100" />
             <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium">
               Изготовление и монтаж
             </p>
           </div>
           <div className="mt-10 flex gap-1.5">
             <div className="w-1.5 h-1.5 bg-[#f39200]/20 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
             <div className="w-1.5 h-1.5 bg-[#f39200]/50 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
             <div className="w-1.5 h-1.5 bg-[#f39200] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
           </div>
        </div>
      </div>
    );
  }

  if (authStatus !== 'authenticated') {
    return (
      <div className="min-h-screen bg-gray-200 flex flex-col max-w-md mx-auto shadow-xl relative overflow-hidden border-x border-gray-100">
        {authStatus === 'loading' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-50 gap-4">
            <Loader2 size={32} className="animate-spin text-[#f39200]" />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Загрузка...</p>
          </div>
        )}
        {authStatus === 'anonymous' && (
          <div className="flex-1 flex flex-col">
            {authError && (
              <p className="mx-6 mt-6 text-red-500 text-xs font-bold text-center leading-snug">{authError}</p>
            )}
            <LoginScreen />
          </div>
        )}
      </div>
    );
  }

  let headerTitle = "";
  if (currentScreen === 'products') headerTitle = "Выбор изделия";
  else if (currentScreen === 'calc') headerTitle = selectedProductType || "";
  else if (currentScreen === 'archive') headerTitle = "Облачный Архив";
  else if (currentScreen === 'cart') headerTitle = "Корзина";
  else if (currentScreen === 'admin') headerTitle = "Настройки цен";
  else if (currentScreen === 'upcoming') headerTitle = "Заявки на замер";
  else if (currentScreen === 'inProgress') headerTitle = "Замеры в работе";

  return (
    <div className="min-h-screen bg-gray-200 flex flex-col max-w-md mx-auto shadow-xl relative overflow-hidden border-x border-gray-100">
      {/* Admin Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                <Lock size={20} />
              </div>
              <button onClick={() => {setShowPasswordModal(false); setAdminPassword(''); setLoginError(false);}} className="text-gray-400 p-1">
                <X size={20} />
              </button>
            </div>
            <h3 className="text-lg font-black text-gray-800 mb-1">Доступ ограничен</h3>
            <p className="text-xs text-gray-400 mb-4">Введите пароль администратора для входа в настройки</p>
            
            <input 
              type="password" 
              autoFocus
              value={adminPassword}
              onChange={(e) => {
                setAdminPassword(e.target.value);
                if (loginError) setLoginError(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
              placeholder="••••••••"
              className={`w-full p-4 bg-gray-50 border rounded-2xl text-center text-xl font-bold tracking-[0.5em] outline-none transition-colors mb-2 ${loginError ? 'border-red-500 bg-red-50' : 'border-gray-200 focus:border-blue-500'}`}
            />
            
            {loginError && (
              <p className="text-red-500 text-[11px] font-bold text-center mb-4 animate-bounce">Пароль неверный</p>
            )}
            
            <button 
              onClick={handleAdminLogin}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-blue-100 active:scale-95 transition-transform"
            >
              Войти
            </button>
          </div>
        </div>
      )}

      {currentScreen !== 'menu' && (
        <header className="bg-white border-b border-gray-100 px-3 py-4 flex items-center sticky top-0 z-50 shadow-sm min-h-[64px]">
          {/* Левая колонка для кнопки Назад */}
          <div className="w-10 flex items-center">
            <button 
              onClick={() => {
                if (currentScreen === 'products' && editingArchiveOrderId) navigateToCart();
                else if (currentScreen === 'products' || currentScreen === 'archive' || currentScreen === 'admin' || currentScreen === 'upcoming' || currentScreen === 'inProgress') navigateToMenu();
                else if (currentScreen === 'calc') editingArchiveOrderId ? navigateToCart() : navigateToProducts();
                else if (currentScreen === 'cart') editingArchiveOrderId ? navigateToArchive() : navigateToProducts();
                else navigateToMenu();
              }} 
              className="p-1 hover:bg-gray-50 text-gray-400 rounded-full transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
          </div>
          
          {/* Центральная колонка для заголовка */}
          <div className="flex-1 flex justify-center overflow-hidden px-2">
            <h1 className="font-black text-[14px] sm:text-base tracking-widest text-gray-800 uppercase truncate text-center">
              {headerTitle}
            </h1>
          </div>
          
          {/* Правая колонка для Домой и Корзины */}
          <div className="w-20 flex items-center justify-end gap-1">
            <button onClick={navigateToMenu} className="p-1.5 hover:bg-gray-50 text-gray-400 rounded-full transition-colors">
              <Home size={20} />
            </button>
            {currentScreen !== 'cart' && currentScreen !== 'archive' && currentScreen !== 'admin' && (
              <button 
                onClick={navigateToCart}
                className="relative p-1.5 hover:bg-gray-50 text-gray-600 rounded-full transition-colors"
              >
                <ShoppingCart size={24} />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#f39200] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-sm">
                    {cartCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </header>
      )}

      <main
        ref={mainContentRef}
        className={`flex-1 flex flex-col overflow-y-auto ${currentScreen !== 'menu' ? 'pb-6' : ''}`}
      >
        {currentScreen === 'menu' && (
          <MenuScreen 
            onCreate={startManualMeasurement}
            onViewArchive={navigateToArchive} 
            onViewUpcoming={navigateToUpcoming}
            onOpenAdmin={() => setShowPasswordModal(true)}
            userDisplayName={userProfile?.displayName}
            userRole={userProfile?.role}
            onLogout={handleLogout}
          />
        )}
        {currentScreen === 'products' && (
          <HomeScreen onSelectType={navigateToCalc} onOpenCart={navigateToCart} cartCount={cartCount} />
        )}
        {currentScreen === 'calc' && selectedProductType && (
          <CalcScreen 
            type={selectedProductType} 
            initialItem={editingItem}
            onAddToCart={addToCart} 
            onCancel={() => (editingItem || editingArchiveOrderId) ? navigateToCart() : navigateToProducts()} 
            prices={prices}
          />
        )}
        {currentScreen === 'cart' && (
          <CartScreen 
            order={order} 
            onRemoveItem={removeFromCart} 
            onEditItem={handleEditItem}
            onAddItemToOrder={handleAddItemToEditedArchive}
            onUpdateOrder={updateOrder}
            onSaveToArchive={saveToArchive}
            onClearOrder={clearOrder}
            isEditingArchiveOrder={Boolean(editingArchiveOrderId)}
            saveButtonLabel={editingArchiveOrderId ? 'Сохранить изменения' : 'Сохранить замер'}
            prices={prices}
          />
        )}
        {currentScreen === 'archive' && (
          <ArchiveScreen 
            archive={archive} 
            onDelete={deleteFromArchive} 
            onEditArchive={startArchiveEdit}
            onWorkStatusUpdated={applyArchiveWorkStatusUpdate}
            onRefresh={refreshArchiveFromCloud}
            prices={prices}
          />
        )}
        {currentScreen === 'admin' && (
          <AdminScreen 
            prices={prices} 
            onSave={savePrices} 
            onReset={() => savePrices(DEFAULT_PRICES)} 
          />
        )}
        {currentScreen === 'upcoming' && userProfile && (
          <UpcomingScreen
            measurerUid={userProfile.uid}
            measurerDisplayName={userProfile.displayName}
            measurerRole={userProfile.role}
            onStartWork={startUpcomingMeasurement} />
        )}
        {currentScreen === 'inProgress' && (
          <InProgressScreen />
        )}
      </main>
    </div>
  );
};

export default App;
