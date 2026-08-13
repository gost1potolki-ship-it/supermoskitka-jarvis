export {
  ACTUAL_COST_CATALOG_VERSION,
  CORNER_COST_RUB_PER_PIECE,
  CORD_5MM_COST_RUB_PER_M,
  FRAME_PROFILE_25_COST_RUB_PER_M,
  IMPOST_CONNECTOR_COST_RUB,
  IMPOST_COST_RUB_PER_M,
  MESH_ACTUAL_COST_RUB_PER_M2,
  actualCostCatalogEntries,
  type ActualCostCatalogEntry,
  type ActualCostMeshType,
  type ActualCostProfileColor,
} from './actual-cost-catalog-v1.js';

export {
  HARD_GROSS_MARGIN_FLOOR,
  LINEAR_PROFILE_WASTE_RATE,
  MESH_WASTE_RATE,
  NORMAL_GROSS_MARGIN_TARGET,
  PSYCH_TARGET_BELOW_THRESHOLD_RUB,
  PSYCH_THRESHOLD_STEP_RUB,
  PSYCH_WINDOW_ABOVE_THRESHOLD_RUB,
} from './actual-cost-config.js';

export {
  calculateFrame600x1800WhiteStandardFixture,
  calculateFrameBomCost,
  type FrameBomCostBreakdown,
  type FrameBomCostInput,
} from './frame-bom-cost.js';
