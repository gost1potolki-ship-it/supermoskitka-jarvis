import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import type { ArchivedOrder, OrderState, OrderWorkStatus } from '@calc/types';
import { db } from '../firebase';
import { type ArchiveOrderView, resolveArchiveWorkStatus } from './archive';

export const PENDING_ARCHIVE_OUTBOX_KEY = 'calc_pc_pending_archive_orders';
export const EDITING_ARCHIVE_ORDER_ID_KEY = 'calc_pc_editing_archive_id';
export const EDITING_ARCHIVE_ORDER_DATE_KEY = 'calc_pc_editing_archive_date';

type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'error';
type OutboxOperation = 'upsert' | 'delete';

export interface PendingArchiveOutboxEntry {
  archiveId: string;
  operation: OutboxOperation;
  order?: ArchivedOrder;
  syncToken?: string;
  createdAt: number;
  status: OutboxStatus;
  lastError?: string;
}

const ACTIVE_OUTBOX_STATUSES: OutboxStatus[] = ['pending', 'syncing', 'error'];

let outbox: PendingArchiveOutboxEntry[] = [];
let isSyncing = false;
let shouldRerun = false;
let lastSaveAt = 0;
let saveInProgress = false;
const changeListeners = new Set<() => void>();

const notify = (): void => {
  changeListeners.forEach((cb) => cb());
};

export const subscribeOutbox = (cb: () => void): (() => void) => {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
};

export const readPendingArchiveOutbox = (): PendingArchiveOutboxEntry[] => {
  const raw = localStorage.getItem(PENDING_ARCHIVE_OUTBOX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry: PendingArchiveOutboxEntry) => {
        if (!entry?.archiveId) return null;
        const status: OutboxStatus =
          entry.status === 'synced' || entry.status === 'error' || entry.status === 'syncing'
            ? entry.status
            : 'pending';
        const operation: OutboxOperation = entry.operation === 'delete' ? 'delete' : 'upsert';
        if (operation === 'upsert' && !entry.order) return null;
        return {
          ...entry,
          status: status === 'syncing' ? 'pending' : status,
          operation,
          syncToken:
            entry.syncToken ||
            entry.order?.syncToken ||
            `${entry.archiveId}:${entry.createdAt || Date.now()}`,
        } as PendingArchiveOutboxEntry;
      })
      .filter(Boolean) as PendingArchiveOutboxEntry[];
  } catch {
    return [];
  }
};

outbox = readPendingArchiveOutbox();

const persistOutbox = (
  updater: (prev: PendingArchiveOutboxEntry[]) => PendingArchiveOutboxEntry[]
): PendingArchiveOutboxEntry[] => {
  outbox = updater(outbox);
  localStorage.setItem(PENDING_ARCHIVE_OUTBOX_KEY, JSON.stringify(outbox));
  notify();
  return outbox;
};

const isAdvancedWorkStatus = (status: unknown): boolean =>
  status === 'in_production' || status === 'ready';

const pickOutboxStatusGuardFields = (serverData: Record<string, unknown>): Partial<ArchivedOrder> => ({
  workStatus: serverData.workStatus as OrderWorkStatus | undefined,
  workStatusLabel: serverData.workStatusLabel as string | undefined,
  workStatusUpdatedAt: serverData.workStatusUpdatedAt,
});

function mergeCloudAndPendingArchive(
  cloud: ArchiveOrderView[],
  entries: PendingArchiveOutboxEntry[]
): ArchiveOrderView[] {
  const byArchiveId = new Map<string, ArchiveOrderView>();
  const outboxById = new Map(entries.map((entry) => [entry.archiveId, entry]));

  for (const cloudOrder of cloud) {
    const outboxEntry = outboxById.get(cloudOrder.archiveId);
    const hasActiveOutbox = Boolean(outboxEntry && ACTIVE_OUTBOX_STATUSES.includes(outboxEntry.status));

    if (outboxEntry?.operation === 'delete' && hasActiveOutbox) continue;

    if (outboxEntry?.operation === 'upsert' && outboxEntry.order && hasActiveOutbox) {
      byArchiveId.set(cloudOrder.archiveId, {
        ...cloudOrder,
        ...outboxEntry.order,
        archiveId: cloudOrder.archiveId,
        firestoreId: cloudOrder.firestoreId,
        hasPendingWrites: true,
        syncStatus: outboxEntry.status === 'error' ? 'error' : 'pending',
        syncError: outboxEntry.lastError,
      });
      continue;
    }

    byArchiveId.set(cloudOrder.archiveId, {
      ...cloudOrder,
      syncStatus: cloudOrder.hasPendingWrites
        ? 'pending'
        : outboxEntry?.status === 'error'
          ? 'error'
          : undefined,
      syncError: outboxEntry?.lastError,
    });
  }

  for (const outboxEntry of entries) {
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

  return [...byArchiveId.values()].sort((a, b) => {
    const aTs = Number(a.archiveId.split('-')[0]) || 0;
    const bTs = Number(b.archiveId.split('-')[0]) || 0;
    return bTs - aTs;
  });
}

export const getMergedOrders = (cloud: ArchiveOrderView[]): ArchiveOrderView[] =>
  mergeCloudAndPendingArchive(cloud, outbox);

export const generateArchiveId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const getEditingArchiveId = (): string | null =>
  localStorage.getItem(EDITING_ARCHIVE_ORDER_ID_KEY);

export const getEditingArchiveDate = (): string | null =>
  localStorage.getItem(EDITING_ARCHIVE_ORDER_DATE_KEY);

export const persistEditingArchiveContext = (archiveId: string | null, archiveDate?: string): void => {
  if (archiveId) {
    localStorage.setItem(EDITING_ARCHIVE_ORDER_ID_KEY, archiveId);
    if (archiveDate) localStorage.setItem(EDITING_ARCHIVE_ORDER_DATE_KEY, archiveDate);
  } else {
    localStorage.removeItem(EDITING_ARCHIVE_ORDER_ID_KEY);
    localStorage.removeItem(EDITING_ARCHIVE_ORDER_DATE_KEY);
  }
};

export const clearEditingArchiveContext = (): void => {
  persistEditingArchiveContext(null);
};

export const saveToArchive = (
  order: OrderState,
  editingArchiveId: string | null,
  existingOrder?: ArchivedOrder | null
): { ok: boolean; archiveId?: string; error?: string } => {
  const now = Date.now();
  if (now - lastSaveAt < 800 || saveInProgress) return { ok: false };
  if (!order.items.length) return { ok: false, error: 'Корзина пуста' };

  saveInProgress = true;
  lastSaveAt = now;
  const syncToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const persistedEditingDate = localStorage.getItem(EDITING_ARCHIVE_ORDER_DATE_KEY);
    const archiveId = editingArchiveId || generateArchiveId();
    const workStatusContext = resolveArchiveWorkStatus(existingOrder);
    const newArchivedOrder: ArchivedOrder = {
      ...order,
      archiveId,
      syncToken,
      date: existingOrder?.date || persistedEditingDate || new Date().toLocaleString('ru-RU'),
      ...workStatusContext,
    };
    const sanitizedOrder = JSON.parse(JSON.stringify(newArchivedOrder)) as ArchivedOrder;

    persistOutbox((prev) => {
      const filtered = prev.filter((entry) => entry.archiveId !== archiveId);
      return [
        ...filtered,
        {
          archiveId,
          operation: 'upsert',
          order: sanitizedOrder,
          syncToken,
          createdAt: Date.now(),
          status: 'pending',
        },
      ];
    });

    void syncOutbox(archiveId);
    return { ok: true, archiveId };
  } finally {
    saveInProgress = false;
  }
};

export const deleteFromArchive = (order: ArchiveOrderView): void => {
  const archiveId = order.archiveId;
  const firestoreId = order.firestoreId;

  persistOutbox((prev) => {
    const filtered = prev.filter((entry) => entry.archiveId !== archiveId);
    if (!firestoreId) return filtered;
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

  if (firestoreId) void syncOutbox(archiveId);
};

export const applyArchiveWorkStatusUpdate = (
  archiveId: string,
  workStatus: OrderWorkStatus,
  workStatusLabel: string
): void => {
  persistOutbox((prev) =>
    prev.map((entry) => {
      if (entry.archiveId !== archiveId || entry.operation !== 'upsert' || !entry.order) return entry;
      return {
        ...entry,
        status: 'pending',
        lastError: undefined,
        order: {
          ...entry.order,
          workStatus,
          workStatusLabel,
          workStatusUpdatedAt: new Date().toISOString(),
        },
      };
    })
  );
  void syncOutbox(archiveId);
};

export const syncOutbox = async (archiveId?: string): Promise<void> => {
  if (isSyncing) {
    shouldRerun = true;
    return;
  }
  isSyncing = true;

  try {
    for (let cycle = 0; cycle < 8; cycle++) {
      shouldRerun = false;
      const entries = outbox.filter((entry) => {
        if (archiveId && entry.archiveId !== archiveId) return false;
        return entry.status === 'pending' || entry.status === 'error';
      });

      if (entries.length === 0) break;

      for (const entry of entries) {
        persistOutbox((prev) =>
          prev.map((candidate) =>
            candidate.archiveId === entry.archiveId
              ? { ...candidate, status: 'syncing', lastError: undefined }
              : candidate
          )
        );

        try {
          if (entry.operation === 'delete') {
            await deleteDoc(doc(db, 'measurements', entry.archiveId));
            persistOutbox((prev) => prev.filter((candidate) => candidate.archiveId !== entry.archiveId));
          } else if (entry.order) {
            const serverSnap = await getDoc(doc(db, 'measurements', entry.archiveId));
            const serverData = serverSnap.exists() ? serverSnap.data() : null;
            const localStatus = entry.order.workStatus ?? 'waiting';

            if (serverData && localStatus === 'waiting' && isAdvancedWorkStatus(serverData.workStatus)) {
              const confirmedSyncToken =
                typeof serverData.syncToken === 'string' ? serverData.syncToken : undefined;
              if (entry.syncToken && confirmedSyncToken === entry.syncToken) {
                persistOutbox((prev) => prev.filter((candidate) => candidate.archiveId !== entry.archiveId));
              } else {
                const serverPatch = pickOutboxStatusGuardFields(serverData);
                persistOutbox((prev) =>
                  prev.map((candidate) => {
                    if (candidate.archiveId !== entry.archiveId || !candidate.order) return candidate;
                    return {
                      ...candidate,
                      status: 'pending',
                      order: { ...candidate.order, ...serverPatch },
                    };
                  })
                );
              }
              continue;
            }

            const orderPayload = JSON.parse(JSON.stringify(entry.order)) as ArchivedOrder;
            if ((orderPayload.workStatus ?? 'waiting') === 'waiting') {
              delete orderPayload.workStatus;
              delete orderPayload.workStatusLabel;
              delete orderPayload.workStatusUpdatedAt;
            }
            await setDoc(doc(db, 'measurements', entry.archiveId), orderPayload, { merge: true });
            persistOutbox((prev) =>
              prev.map((candidate) =>
                candidate.archiveId === entry.archiveId
                  ? { ...candidate, status: 'synced' }
                  : candidate
              )
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
          persistOutbox((prev) =>
            prev.map((candidate) =>
              candidate.archiveId === entry.archiveId
                ? { ...candidate, status: 'error', lastError: message }
                : candidate
            )
          );
        }
      }

      if (!shouldRerun) break;
    }
  } finally {
    isSyncing = false;
  }
};
