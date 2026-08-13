/** V1 provisional operational waste reserve — owner-adjustable later. */
export const LINEAR_PROFILE_WASTE_RATE = 0.05;
export const MESH_WASTE_RATE = 0.05;

/** Internal profitability indicators only — never mutate customer selling price. */
export const NORMAL_GROSS_MARGIN_TARGET = 0.5;
export const HARD_GROSS_MARGIN_FLOOR = 0.47;

/**
 * Psychological pricing constants are postponed / not active in Task 11.1.1.
 * Kept as configuration data only.
 */
export const PSYCH_THRESHOLD_STEP_RUB = 1000;
export const PSYCH_WINDOW_ABOVE_THRESHOLD_RUB = 50;
export const PSYCH_TARGET_BELOW_THRESHOLD_RUB = 30;
export const PSYCHOLOGICAL_PRICING_ACTIVE = false;
