import { collection, onSnapshot, orderBy, query, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import {
  filterArchiveOrders,
  normalizeArchiveOrder,
  type ArchiveFilter,
  type ArchiveOrderView,
} from './lib/archive';
import { getMergedOrders, subscribeOutbox, syncOutbox } from './lib/archive-outbox';

let cloudOrders: ArchiveOrderView[] = [];
let ordersFilter: ArchiveFilter = 'waiting';
let unsubFirestore: Unsubscribe | null = null;
const listeners = new Set<() => void>();

const notify = (): void => {
  listeners.forEach((cb) => cb());
};

export const subscribeOrders = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const getOrdersFilter = (): ArchiveFilter => ordersFilter;

export const setOrdersFilter = (filter: ArchiveFilter): void => {
  ordersFilter = filter;
  notify();
};

export const getDisplayOrders = (): ArchiveOrderView[] =>
  filterArchiveOrders(getMergedOrders(cloudOrders), ordersFilter);

export const getAllMergedOrders = (): ArchiveOrderView[] => getMergedOrders(cloudOrders);

export const findOrderByArchiveId = (archiveId: string): ArchiveOrderView | undefined =>
  getAllMergedOrders().find((o) => o.archiveId === archiveId);

export const startOrdersSubscription = (): void => {
  if (unsubFirestore) return;

  unsubFirestore = onSnapshot(
    query(collection(db, 'measurements'), orderBy('archiveId', 'desc')),
    (snapshot) => {
      cloudOrders = snapshot.docs.map((d) =>
        normalizeArchiveOrder(
          { ...d.data(), hasPendingWrites: d.metadata.hasPendingWrites } as Record<string, unknown>,
          d.id
        )
      );
      notify();
    },
    (error) => {
      console.error('[ORDERS] onSnapshot error', error);
    }
  );

  subscribeOutbox(notify);
  void syncOutbox();
};

export const refreshOrders = async (): Promise<void> => {
  await syncOutbox();
};

export const stopOrdersSubscription = (): void => {
  unsubFirestore?.();
  unsubFirestore = null;
};
