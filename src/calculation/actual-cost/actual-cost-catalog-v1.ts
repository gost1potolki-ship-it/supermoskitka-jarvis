/**
 * Actual Cost Catalog V1 — owner-confirmed purchase costs.
 * Separate from Legacy Selling Catalog; never overwrites selling prices.
 */

export type ActualCostProfileColor = 'WHITE' | 'BROWN_8017' | 'GRAY_7016';

export type ActualCostMeshType = 'STANDARD' | 'ANTIMOSHKA' | 'ANTICAT' | 'ANTIDUST';

export interface ActualCostCatalogEntry {
  componentKey: string;
  variant?: string;
  unit: 'METER' | 'M2' | 'PIECE';
  grossCostRub: number;
  supplier: string;
  sourceDocument: string;
  effectiveFrom: string;
}

/** Frame profile 25×10 — VDP price list 28.04.2026 */
export const FRAME_PROFILE_25_COST_RUB_PER_M: Record<ActualCostProfileColor, number> = {
  WHITE: 55.0,
  BROWN_8017: 60.0,
  GRAY_7016: 60.0,
};

/** Central crossbar / impost — VDP 28.04.2026 */
export const IMPOST_COST_RUB_PER_M: Record<ActualCostProfileColor, number> = {
  WHITE: 60.0,
  BROWN_8017: 60.0,
  GRAY_7016: 66.0,
};

/** PVC corner — VDP 28.04.2026 */
export const CORNER_COST_RUB_PER_PIECE: Record<ActualCostProfileColor, number> = {
  WHITE: 5.5,
  BROWN_8017: 5.5,
  GRAY_7016: 7.0,
};

export const IMPOST_CONNECTOR_COST_RUB = 1.84;
export const CORD_5MM_COST_RUB_PER_M = 5.61;
export const SCREW_COST_RUB = 0.31;

/** Poll-tex / ANTIDUST invoice: 432.79 ₽/linear m net, VAT 22%, width 1.6 m */
export const POLLTEX_INVOICE_NET_RUB_PER_LINEAR_M = 432.79;
export const POLLTEX_VAT_RATE = 0.22;
export const POLLTEX_WIDTH_M = 1.6;

export function computePolltexGrossCostRubPerM2(): number {
  return (
    Math.round(
      ((POLLTEX_INVOICE_NET_RUB_PER_LINEAR_M * (1 + POLLTEX_VAT_RATE)) / POLLTEX_WIDTH_M) * 100,
    ) / 100
  );
}

/** Mesh actual costs — invoice-derived */
export const MESH_ACTUAL_COST_RUB_PER_M2: Record<ActualCostMeshType, number> = {
  STANDARD: 43.58,
  ANTIMOSHKA: 87.39,
  ANTICAT: 155.51,
  ANTIDUST: computePolltexGrossCostRubPerM2(),
};

export const ACTUAL_COST_CATALOG_VERSION = 'actual-cost-catalog-v1';

export const MISSING_COST_REASON = {
  FRAME_PROFILE_32_ACTUAL_COST_UNKNOWN: 'FRAME_PROFILE_32_ACTUAL_COST_UNKNOWN',
  FRAME_HARDWARE_ACTUAL_COST_UNKNOWN: 'FRAME_HARDWARE_ACTUAL_COST_UNKNOWN',
  FRAME_RAL_PAINTING_ACTUAL_COST_UNKNOWN: 'FRAME_RAL_PAINTING_ACTUAL_COST_UNKNOWN',
  WING_ACTUAL_COST_UNKNOWN: 'WING_ACTUAL_COST_UNKNOWN',
  DOOR_ACTUAL_COST_UNKNOWN: 'DOOR_ACTUAL_COST_UNKNOWN',
  PLISSE_ACTUAL_COST_UNKNOWN: 'PLISSE_ACTUAL_COST_UNKNOWN',
  MIXED_ORDER_COMMON_COST_UNALLOCATED: 'MIXED_ORDER_COMMON_COST_UNALLOCATED',
  REGIONAL_DELIVERY_DIRECT_COST_UNKNOWN: 'REGIONAL_DELIVERY_DIRECT_COST_UNKNOWN',
} as const;

export function actualCostCatalogEntries(): ActualCostCatalogEntry[] {
  const vdp = {
    supplier: 'VDP',
    sourceDocument: 'VDP price list 28.04.2026',
    effectiveFrom: '2026-04-28',
  } as const;

  const entries: ActualCostCatalogEntry[] = [];
  for (const [color, price] of Object.entries(FRAME_PROFILE_25_COST_RUB_PER_M)) {
    entries.push({
      componentKey: 'frame_profile_25',
      variant: color,
      unit: 'METER',
      grossCostRub: price,
      ...vdp,
    });
  }
  for (const [color, price] of Object.entries(IMPOST_COST_RUB_PER_M)) {
    entries.push({
      componentKey: 'impost',
      variant: color,
      unit: 'METER',
      grossCostRub: price,
      ...vdp,
    });
  }
  for (const [color, price] of Object.entries(CORNER_COST_RUB_PER_PIECE)) {
    entries.push({
      componentKey: 'pvc_corner',
      variant: color,
      unit: 'PIECE',
      grossCostRub: price,
      ...vdp,
    });
  }
  entries.push({
    componentKey: 'cord_5mm',
    unit: 'METER',
    grossCostRub: CORD_5MM_COST_RUB_PER_M,
    ...vdp,
  });
  entries.push({
    componentKey: 'impost_connector',
    unit: 'PIECE',
    grossCostRub: IMPOST_CONNECTOR_COST_RUB,
    ...vdp,
  });
  entries.push({
    componentKey: 'screw',
    unit: 'PIECE',
    grossCostRub: SCREW_COST_RUB,
    ...vdp,
  });
  for (const [mesh, price] of Object.entries(MESH_ACTUAL_COST_RUB_PER_M2)) {
    entries.push({
      componentKey: 'mesh',
      variant: mesh,
      unit: 'M2',
      grossCostRub: price,
      supplier: mesh === 'ANTIDUST' ? 'EMITEX' : 'invoice',
      sourceDocument:
        mesh === 'ANTIDUST'
          ? 'EMITEX #434 22.07.2026 (432.79×1.22/1.6 → 330.00 ₽/m²)'
          : 'invoice #1041 29.04.2026',
      effectiveFrom: mesh === 'ANTIDUST' ? '2026-07-22' : '2026-04-29',
    });
  }
  return entries;
}
