/**
 * Legacy types ported from calc_v2/types.ts (calculation-related subset).
 * Source commit: 66465b172c105dc259c2772e1c872b2e10e521c9
 */

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
  ADJUSTMENT = 'Регулировка',
}

export type ColorType =
  | 'white'
  | 'brown'
  | 'gray'
  | 'ral'
  | 'unpainted'
  | 'anthracite'
  | 'beige'
  | 'black'
  | 'gold'
  | 'gray7040';

export type MeshType =
  | 'standard'
  | 'anticat'
  | 'antipyl'
  | 'antimoshka'
  | 'antikoshka'
  | 'antimosquito'
  | 'antipollen'
  | 'fb1601'
  | 'fb1602'
  | 'fb1603'
  | 'fb1604'
  | 'fb1605'
  | 'fb1606'
  | 'fb1607'
  | 'fa1621'
  | 'fa1622'
  | 'fa1623'
  | 'fa1624'
  | 'fa1625'
  | 'fa1626'
  | 'fa1627'
  | 'full_blackout'
  | 'semi_blackout';

export type MountType = 'standard' | 'z_metal' | 'plunger';
export type CornerType = 'plastic' | 'aluminum';
export type HandleType = 'plastic' | 'metal';
export type PlisseOpening = 'side' | 'up' | 'counter';
export type PlisseThreshold = 'standard' | 'low' | 'reinforced';
export type OrderDiscountPercent = 0 | 5 | 10;
export type PaymentMethod = 'cash' | 'qr';

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

export interface OrderState {
  items: CartItem[];
  deliveryType: 'city' | 'out' | 'pickup';
  deliveryKm: number;
  globalInstall: boolean;
  installOverride?: number | null;
  orderDiscountPercent?: OrderDiscountPercent;
  includeMeasurementFee?: boolean;
  paymentMethod?: PaymentMethod;
  generalComment?: string;
}

export interface ArchivedOrder extends OrderState {
  archiveId: string;
  date: string;
  total?: number;
  orderTotal?: number;
  amount?: number;
  amount_rub?: number;
}
