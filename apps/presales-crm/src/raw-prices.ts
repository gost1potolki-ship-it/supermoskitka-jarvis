/** Закупочные цены — только веб-версия (ТЗ costPrice) */
export const RAW_PRICES = {
  COEFF_WASTE: 1.1,
  ASSEMBLY_FEE: 250,

  PRICES_PROFILE: {
    white: 55,
    brown: 60,
    gray: 60,
    wing_white: 77,
    wing_color: 80,
  },

  PRICE_IMPOST: 60,
  PRICE_IMPOST_FASTENERS: 42,

  PRICES_MESH: {
    standard: 41,
    antimosquito: 82,
    anticat: 155,
    antidust: 900,
  },

  PRICES_Z_METAL: {
    white: 7,
    brown: 8,
    gray: 20,
  },

  PRICES_CORNERS: {
    white: 20,
    brown: 22,
    gray: 80,
  },

  PRICE_CORD: 6,
  PRICE_HANDLES: 2,

  /** ФОТ монтажника: 1 изделие — 1000 ₽, 2+ — 500 ₽ за изделие */
  MOUNTING_FEE_SINGLE: 1000,
  MOUNTING_FEE_PER_ITEM: 500,
} as const;
