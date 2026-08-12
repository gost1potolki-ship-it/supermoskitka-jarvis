import type { LegacyPriceCatalog } from './legacy/embedded-default-prices.js';
import type {
  ColorType,
  MeshType,
  MountType,
  CornerType,
  HandleType,
  PlisseOpening,
  PlisseThreshold,
} from './legacy/types.js';

export const CALCULATION_ENGINE_VERSION = 'supermoskitka-calculation-v1';

export type CalculationCustomerType = 'retail' | 'dealer' | 'corporate';

export type CalculationProductType = 'FRAME' | 'WING' | 'DOOR' | 'PLISSE_NET';

export type CalculationStatus = 'calculated' | 'needs_input' | 'unsupported';

export type PriceCatalog = LegacyPriceCatalog;

export interface PriceCatalogSnapshot {
  version: string;
  prices: PriceCatalog;
}

export interface PriceCatalogProvider {
  getPriceCatalog(): Promise<PriceCatalogSnapshot>;
}

export interface CalculationItemInput {
  itemId: string;
  productType: CalculationProductType;
  widthMm?: number;
  heightMm?: number;
  quantity?: number;
  color?: ColorType;
  meshType?: MeshType;
  frameProfile?: '25' | '32';
  doorProfile?: '32' | '42';
  fastening?: MountType;
  cornerType?: CornerType;
  handleType?: HandleType;
  openingType?: PlisseOpening;
  thresholdType?: PlisseThreshold;
  handlesCount?: number;
  hingesCount?: number;
  hasLatch?: boolean;
}

export interface DeliveryInput {
  type: 'city' | 'out' | 'pickup';
  distanceKm?: number;
}

export interface InstallationInput {
  enabled: boolean;
  overrideAmount?: number | null;
}

export interface MeasurementInput {
  includeFee: boolean;
  paidCash?: boolean;
}

export interface DiscountInput {
  percent: 0 | 5 | 10;
}

export interface PaymentInput {
  method: 'cash' | 'qr';
}

export interface CalculationRequest {
  customerType: CalculationCustomerType;
  items: CalculationItemInput[];
  delivery?: DeliveryInput;
  installation?: InstallationInput;
  measurement?: MeasurementInput;
  discount?: DiscountInput;
  payment?: PaymentInput;
}

export interface CalculationItemResult {
  itemId: string;
  productType: CalculationProductType;
  quantity: number;
  unitPrice: number;
  productTotal: number;
  installationTotal: number;
}

export interface CalculationOutcome {
  status: CalculationStatus;
  items: CalculationItemResult[];
  total: number | null;
  warnings: string[];
  missingFields: string[];
  calculationVersion: string;
  priceVersion: string;
  /** Present only when status === 'calculated' — order-level breakdown without internal costs. */
  orderBreakdown?: {
    itemsBasePrice: number;
    measurementFee: number;
    installTotal: number;
    deliveryCost: number;
    discountPercent: 0 | 5 | 10;
    discountAmount: number;
    paymentSurcharge: number;
    grandTotal: number;
  };
}

export interface CalculationEngine {
  calculate(request: CalculationRequest): Promise<CalculationOutcome>;
}
