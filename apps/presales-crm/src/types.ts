export type {
  CartItem,
  ColorType,
  CornerType,
  CustomerInfo,
  HandleType,
  MeshType,
  MountType,
  OrderState,
  PlisseOpening,
  PlisseThreshold,
} from '@calc/types';
export { ProductType } from '@calc/types';

export type { CalculationResult } from './cost-calculation';

/** Позиция корзины веб-версии: базовые поля + внутренняя себестоимость */
import type { CartItem as BaseCartItem } from '@calc/types';

export interface WebCartItem extends BaseCartItem {
  costMaterials?: number;
  costAssembly?: number;
  costTotal?: number;
  profit?: number;
  marginPercent?: number;
}

export type Screen = 'menu' | 'measurements' | 'orders' | 'products' | 'calc' | 'cart';

export interface ProductMatrixEntry {
  productType: string;
  engine: string;
  requiredFields: string;
  optionalFields: string;
  ignoredFields: string;
  notes: string;
}

export interface ProductFieldsMatrix {
  exportedAt: string;
  entries: ProductMatrixEntry[];
}

export interface PricesExport {
  exportedAt: string;
  source: string;
  price_settings: Record<string, unknown>;
}

/** Опции выпадающих списков (из calc-spec / UI matrix) */
export interface UiMatrixEntry {
  mesh?: string[];
  color?: string[];
  opening?: string[];
  threshold?: string[];
  handles?: number[];
  mount?: string[];
  cornerType?: string[];
  handleType?: string[];
  frameProfile?: string[];
  doorProfile?: string[];
  hingesCount?: number[];
  hasLatch?: boolean[];
  hasBolt?: boolean[];
  subType?: string[];
  quantity_unit?: string;
}
