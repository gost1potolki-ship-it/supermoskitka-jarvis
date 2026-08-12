import type { CurrentCalculationBusinessRules } from './calculation-types.js';

export const LEGACY_PARITY_BUSINESS_RULES_VERSION = 'legacy-parity-calc_v2-66465b1';

export const CURRENT_BUSINESS_RULES_VERSION = 'current-business-rules-v1.2';

/** Historical mode: no Jarvis overrides; pure calc_v2 snapshot arithmetic. */
export const LEGACY_PARITY_BUSINESS_RULES: CurrentCalculationBusinessRules = {
  applyLaborOverrides: false,
  applyRegionalDeliveryOverride: false,
  regionalDeliveryPerKm: 50,
  assemblyLabor: {
    frame: {
      standard: 250,
      antimoshka: 250,
      anticat: 250,
      antidust: 250,
      plunger: 250,
    },
    wing: 250,
    door: 850,
  },
  plisseMeshPriceReference: {},
};

/** Approved current SuperMoskitka policy used by Jarvis V1. */
export const CURRENT_BUSINESS_RULES: CurrentCalculationBusinessRules = {
  applyLaborOverrides: true,
  applyRegionalDeliveryOverride: true,
  regionalDeliveryPerKm: 60,
  assemblyLabor: {
    frame: {
      standard: 250,
      antimoshka: 250,
      anticat: 300,
      antidust: 300,
      plunger: 300,
    },
    wing: 500,
    door: 850,
  },
  /**
   * Price reference only — ANTIMOSHKA remains ANTIMOSHKA as product identity.
   * PLISSE ANTIMOSHKA uses ANTIDUST mesh unit price (not a semantic alias).
   */
  plisseMeshPriceReference: {
    ANTIMOSHKA: 'ANTIDUST',
  },
};

export function resolveFrameAssemblyLabor(
  meshType: 'STANDARD' | 'ANTIMOSHKA' | 'ANTICAT' | 'ANTIDUST',
  fastening: 'Z_METAL' | 'PLUNGER',
  rules: CurrentCalculationBusinessRules,
): number {
  if (fastening === 'PLUNGER') {
    return rules.assemblyLabor.frame.plunger;
  }
  switch (meshType) {
    case 'STANDARD':
      return rules.assemblyLabor.frame.standard;
    case 'ANTIMOSHKA':
      return rules.assemblyLabor.frame.antimoshka;
    case 'ANTICAT':
      return rules.assemblyLabor.frame.anticat;
    case 'ANTIDUST':
      return rules.assemblyLabor.frame.antidust;
  }
}

/** Resolves which canonical mesh supplies the PLISSE mesh unit price (price reference, not alias). */
export function resolvePlisseMeshPriceReference(
  meshType: 'STANDARD' | 'ANTIMOSHKA' | 'ANTICAT' | 'ANTIDUST',
  rules: CurrentCalculationBusinessRules,
): 'STANDARD' | 'ANTIMOSHKA' | 'ANTICAT' | 'ANTIDUST' {
  const referenced = rules.plisseMeshPriceReference[meshType];
  return referenced ?? meshType;
}
