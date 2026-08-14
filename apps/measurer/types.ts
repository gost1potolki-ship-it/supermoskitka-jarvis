
export enum ProductType {
  FRAME = 'Рамочные',
  WING = 'КРЫЛО',
  DOOR = 'Дверные',
  ROLL = 'Рулонные',
  PLISSE_NET = 'Плиссе Сетки',
  JALOUSIE_CLASSIC = 'ШТОРЫ плиссе ПОРТАЛ',
  JALOUSIE_LIGHT = 'ШТОРЫ плиссе ЛАЙТ',
  JALOUSIE_COZY = 'ШТОРЫ плиссе УЮТ +',
  INSIDE_INSERT = 'Внутривставные',
  SEAL = 'Уплотнительная резинка',
  COMB = 'Гребенка',
  CHILD_LOCK = 'Детский замок',
  ADJUSTMENT = 'Регулировка'
}

/**
 * DATABASE_CONTRACT: ЖЕСТКИЙ МАППИНГ ПОЛЕЙ БД
 * Не изменять без прямого указания "Обнови маппинг БД"
 */
export const DATABASE_MAPPING = {
  address: ['address', 'адрес', 'объект', 'A'],
  customerName: ['name', 'клиент', 'customer', 'B'],
  phone: ['phone', 'телефон', 'tel', 'C'],
  comment: ['comment', 'заметка', 'managerComment', 'D'],
  price: ['amount_rub', 'E', 'цена', 'сумма'],
  payer: ['payer_text', 'F', 'платит', 'кто платит'],
  apartment: ['apt', 'flat', 'кв', 'квартира'],
  time: ['time', 'время', 'замер на']
} as const;

export type ColorType = 'white' | 'brown' | 'gray' | 'ral' | 'unpainted' | 'anthracite' | 'beige' | 'black' | 'gold' | 'gray7040';

export type MeshType = 
  | 'standard' | 'anticat' | 'antipyl' | 'antimoshka' | 'antikoshka' | 'antimosquito' | 'antipollen'
  | 'fb1601' | 'fb1602' | 'fb1603' | 'fb1604' | 'fb1605' | 'fb1606' | 'fb1607'
  | 'fa1621' | 'fa1622' | 'fa1623' | 'fa1624' | 'fa1625' | 'fa1626' | 'fa1627'
  | 'full_blackout' | 'semi_blackout';

export type MountType = 'standard' | 'z_metal' | 'plunger';
export type CornerType = 'plastic' | 'aluminum';
export type HandleType = 'plastic' | 'metal';

export type PlisseOpening = 'side' | 'up' | 'counter';
export type PlisseThreshold = 'standard' | 'low' | 'reinforced';
export type OrderWorkStatus = 'waiting' | 'in_production' | 'ready';

export type UpcomingReservationStatus =
  | 'available'
  | 'reserved'
  | 'completed'
  | 'cancelled';

export interface UpcomingMeasurement {
  id: string;
  address: string;
  apartment?: string;
  customerName: string;
  phone: string;
  comment?: string;
  price: number;
  payerType: 'customer' | 'company';
  time?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  reservationStatus?: UpcomingReservationStatus | null;
  reservedByMeasurerId?: string | null;
  reservedByMeasurerName?: string;
  reservedAt?: unknown;
  completedAt?: unknown;
  completedByMeasurerId?: string;
  archiveId?: string;
  cancelledAt?: unknown;
  cancelledByMeasurerId?: string;
  cancelledByMeasurerName?: string;
  cancelReason?: string;
  /** Дата/время, на которое договорились с заказчиком (замерщик) */
  scheduledAt?: string;
  /** Комментарий замерщика (не CRM `comment`) */
  measurerNote?: string;
  measurerNoteUpdatedAt?: unknown;
  measurerNoteUpdatedBy?: string;
  source?: 'crm' | 'legacy_sheet';
}

export interface CartItem {
  id: string;
  type: ProductType;
  width?: number;
  height?: number;
  quantity?: number;
  color?: ColorType;
  mesh?: MeshType;
  mount?: MountType;
  cornerType?: CornerType;
  handleType?: HandleType;
  frameProfile?: '25' | '32';
  opening?: PlisseOpening;
  threshold?: PlisseThreshold;
  handles?: number;
  price: number;
  installPrice: number;
  details: string;
  comment?: string;
  subType?: 'window' | 'door' | 'pvc' | 'alu';
  doorProfile?: '32' | '42';
  hingesCount?: number;
  hasLatch?: boolean;
  hasBolt?: boolean;
}

export interface CustomerInfo {
  name: string;
  phone: string;
  address: string;
}

export type UserRole = 'measurer' | 'admin';

export interface UserProfile {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string;
  phone?: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Скидка на всю сумму заказа: 0 — без скидки, 5 или 10 процентов */
export type OrderDiscountPercent = 0 | 5 | 10;
/** Способ оплаты заказа: наличные без наценки или оплата по QR/карте с наценкой 8% */
export type PaymentMethod = 'cash' | 'qr';

export interface OrderState {
  items: CartItem[];
  deliveryType: 'city' | 'out' | 'pickup';
  deliveryKm: number;
  globalInstall: boolean;
  installOverride?: number | null;
  /** Скидка на всю сумму заказа: 0, 5 или 10 % */
  orderDiscountPercent?: OrderDiscountPercent;
  /** Включена ли стоимость замера (скрытый платёж). По умолчанию true. Отключение — для менеджера при дистанционном замере. */
  includeMeasurementFee?: boolean;
  /** Способ оплаты заказа. cash — без наценки, qr — с наценкой 8%. */
  paymentMethod?: PaymentMethod;
  generalComment?: string;
  customer?: CustomerInfo;
}

export interface ArchivedOrder extends OrderState {
  archiveId: string;
  date: string;
  workStatus?: OrderWorkStatus;
  workStatusLabel?: string;
  workStatusUpdatedAt?: any;
  /** Токен конкретной попытки сохранения/синхронизации архива */
  syncToken?: string;
  firestoreId?: string;
  hasPendingWrites?: boolean;
  syncStatus?: 'pending' | 'syncing' | 'synced' | 'error';
  syncError?: string;
  /** Страховой депозит оплачен наличными на объекте (не входит в остаток к оплате). */
  measurementRequired?: boolean;
  measurementPaidCash?: boolean;
  /** Сумма страхового депозита, обычно 1000 ₽. */
  measurementFee?: number;
  /** Итог к оплате после отправки в работу (остаток после депозита). */
  managerTotal?: number;
  /** Полная сумма заказа, включая страховой депозит. */
  grandTotal?: number;
  /** Остаток к оплате после вычета полученного страхового депозита. */
  amountDue?: number;
  /** UID замерщика, сохранившего заказ */
  measurerId?: string;
  /** Имя замерщика для отображения */
  measurerName?: string;
  /** ID исходной заявки upcoming_measurements */
  upcomingId?: string;
}
