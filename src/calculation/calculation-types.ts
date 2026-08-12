/**
 * Public Jarvis calculation contract.
 * Must not import product UI unions from legacy/*.
 */

import type { LegacyPriceCatalog } from './legacy/embedded-default-prices.js';

export const CALCULATION_ENGINE_VERSION = 'supermoskitka-calculation-v1.1';

export type CalculationCustomerType = 'retail' | 'dealer' | 'corporate';

export type CalculationProductType = 'FRAME' | 'WING' | 'DOOR' | 'PLISSE_NET';

export type CalculationStatus = 'calculated' | 'needs_input' | 'unsupported';

export type CalculationMeshType = 'STANDARD' | 'ANTIMOSHKA' | 'ANTICAT' | 'ANTIDUST';

export type CalculationFrameFastening = 'Z_METAL' | 'PLUNGER';

export type CalculationCornerType = 'PLASTIC' | 'ALUMINUM';

export type CalculationHandleType = 'PLASTIC' | 'METAL';

export type CalculationPlisseOpening = 'SIDE' | 'COUNTER' | 'UP';

export type CalculationPlisseThreshold = 'STANDARD' | 'LOW' | 'REINFORCED';

export type CalculationColor =
  | { kind: 'WHITE' }
  | { kind: 'BROWN_8017' }
  | { kind: 'GRAY_7016' }
  | {
      kind: 'CUSTOM_RAL';
      ral: string;
      finish?: 'STANDARD' | 'MATTE' | 'GLOSS' | 'MUAR';
    };

export type PriceCatalog = LegacyPriceCatalog;

export interface CurrentCalculationBusinessRules {
  assemblyLabor: {
    frame: {
      standard: number;
      antimoshka: number;
      anticat: number;
      antidust: number;
      plunger: number;
    };
    wing: number;
    door: number;
  };
  regionalDeliveryPerKm: number;
  /** When false, engine uses catalog prices as-is (historical PARITY mode). */
  applyLaborOverrides: boolean;
  applyRegionalDeliveryOverride: boolean;
}

export interface PriceCatalogSnapshot {
  version: string;
  prices: PriceCatalog;
  businessRulesVersion: string;
  businessRules: CurrentCalculationBusinessRules;
}

export interface PriceCatalogProvider {
  getPriceCatalog(): Promise<PriceCatalogSnapshot>;
}

interface BaseCalculationItem {
  itemId: string;
  widthMm?: number;
  heightMm?: number;
  quantity?: number;
}

export interface FrameCalculationItem extends BaseCalculationItem {
  productType: 'FRAME';
  meshType?: CalculationMeshType;
  color?: CalculationColor;
  frameProfile?: '25' | '32';
  fastening?: CalculationFrameFastening;
  cornerType?: CalculationCornerType;
  handleType?: CalculationHandleType;
}

export interface WingCalculationItem extends BaseCalculationItem {
  productType: 'WING';
  meshType?: CalculationMeshType;
  color?: CalculationColor;
  /** Fixed business fastening for Крыло; adapter maps to legacy mount. */
  fastening?: 'WING_FLAGS';
}

export interface DoorCalculationItem extends BaseCalculationItem {
  productType: 'DOOR';
  meshType?: CalculationMeshType;
  color?: CalculationColor;
  doorProfile?: '32' | '42';
  hingesCount?: 2 | 3;
}

export interface PlisseNetCalculationItem extends BaseCalculationItem {
  productType: 'PLISSE_NET';
  meshType?: CalculationMeshType;
  color?: CalculationColor;
  openingType?: CalculationPlisseOpening;
  thresholdType?: CalculationPlisseThreshold;
  handlesCount?: number;
}

export type CalculationItemInput =
  | FrameCalculationItem
  | WingCalculationItem
  | DoorCalculationItem
  | PlisseNetCalculationItem;

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
  businessRulesVersion: string;
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
