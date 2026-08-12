/**
 * TEST / PARITY SNAPSHOT
 * NOT PRODUCTION PRICE SOURCE
 *
 * Source: D:\\calc_v2\\constants.ts → PRICES
 * Source commit: 66465b172c105dc259c2772e1c872b2e10e521c9
 */

export const LEGACY_PARITY_PRICE_CATALOG = {
  "price_settings": {
    "global_markups": {
      "standard_markup": 1.9,
      "waste_coefficient": 1.1
    },
    "classic_frames": {
      "markups": {
        "assembly_labor": 250,
        "door_assembly_labor": 850,
        "company_profit_multiplier": 2,
        "door_profit_multiplier": 2.8,
        "profile_waste_factor": 1.1,
        "ral_surcharge": 1000,
        "ral_painting_rate_m": 220
      },
      "profiles": {
        "standard_25mm": {
          "white": 60,
          "brown": 65,
          "gray": 116,
          "black": 75
        },
        "vsn_vsm_25mm": {
          "white": 195,
          "brown": 200,
          "gray": 205
        },
        "standard_32mm": {
          "white": 255,
          "brown": 260,
          "gray": 290
        },
        "impost_25mm": {
          "white": 65,
          "brown": 70,
          "gray": 121,
          "black": 80
        },
        "wing_30mm": {
          "white": 85,
          "brown": 90,
          "gray": 95,
          "black": 105
        },
        "door_42mm": {
          "white": 290,
          "brown": 300,
          "gray": 350
        }
      },
      "corners": {
        "plastic_25mm": {
          "white": 5,
          "brown": 5.5,
          "gray": 20,
          "black": 11
        },
        "aluminum_25mm": {
          "white": 36,
          "brown": 38,
          "gray": 50,
          "black": 46
        },
        "plastic_32mm": {
          "white": 19,
          "brown": 21,
          "gray": 36
        },
        "door_42mm_internal_external": 21,
        "vsn_vsm_25mm": {
          "white": 14,
          "brown": 15,
          "gray": 24
        }
      },
      "meshes": {
        "standard": 65,
        "antimosquito": 350,
        "antimoshka": 350,
        "anticat": 500,
        "antipollen": 900,
        "antipyl": 900
      },
      "mounts": {
        "cord_5mm": 6,
        "impost_bracket": 15,
        "z_plastic": {
          "white": 2,
          "brown": 2,
          "gray": 4,
          "black": 5
        },
        "z_metal": {
          "white": 7,
          "brown": 8,
          "gray": 20,
          "black": 14
        },
        "vsn_metal_bracket": 44,
        "handle_frame_plastic": {
          "white": 2,
          "brown": 2,
          "gray": 2,
          "black": 2
        },
        "handle_frame_metal": {
          "white": 14,
          "brown": 14,
          "gray": 14,
          "black": 14
        },
        "handle_door_42mm": {
          "white": 80,
          "brown": 83,
          "gray": 160
        },
        "pin_41mm": 95,
        "door_latch": {
          "white": 42,
          "brown": 42,
          "gray": 85
        },
        "door_bolt": 500,
        "screw": 1
      },
      "hinges_42mm": {
        "standard": {
          "white": 40,
          "brown": 43,
          "gray": 81
        },
        "reinforced_pin": {
          "black": 250,
          "white": 300,
          "brown": 350,
          "gray": 450
        },
        "reinforced_closer": {
          "black": 350,
          "white": 400,
          "brown": 450,
          "gray": 550
        }
      }
    },
    "plisse_nets": {
      "markups": {
        "profit_multiplier": 3.35,
        "assembly_rate_standard": 750,
        "assembly_rate_meeting": 800,
        "waste_factor": 1.11,
        "ral_painting_rate_m": 220
      },
      "profiles": {
        "frame": {
          "white": 163,
          "brown": 169,
          "unpainted": 130,
          "anthracite": 169,
          "ral": 163
        },
        "sash": {
          "white": 263,
          "brown": 275,
          "unpainted": 192,
          "anthracite": 273,
          "ral": 263
        }
      },
      "meshes": {
        "standard": 255,
        "antikoshka": 700,
        "antipyl": 650
      },
      "components": {
        "insert_mesh_m": 34,
        "insert_frame_m": 36,
        "handle_standard": 90,
        "thread_m": 7,
        "rivet_pc": 6,
        "stopper_pc": 5,
        "accessories_set": 270,
        "packaging": 50,
        "magnetic_strip_m": 51,
        "low_threshold_m": 220
      }
    },
    "plisse_blinds": {
      "markups": {
        "profit_multiplier": 3.35,
        "assembly_rate": 750
      },
      "fabrics_m2": {
        "full_blackout": 520,
        "semi_blackout": 480
      },
      "lite_system": {
        "profile_m": 140,
        "insert_m": 26,
        "accessories_set": 150
      },
      "cozy_system": {
        "frame_m": {
          "white": 224,
          "anthracite": 224,
          "brown": 224,
          "unpainted": 180,
          "gray": 224,
          "black": 224,
          "gold": 224,
          "ral": 224
        },
        "sash_m": {
          "white": 198,
          "anthracite": 198,
          "brown": 198,
          "unpainted": 160,
          "gray": 198,
          "black": 198,
          "gold": 198,
          "ral": 198
        },
        "insert_m": 28,
        "accessories_set": 220,
        "assembly_rate": 750,
        "spring_pc": 15,
        "scotch_fix": 200
      },
      "ral_painting": {
        "rate_m": 220,
        "min_per_item": 1000
      }
    },
    "window_works": {
      "materials": {
        "foam_can": 650,
        "sealant_tube": 450,
        "cosmofen_bottle": 550,
        "screws_pack": 300
      },
      "labor_rates": {
        "seal_replacement_m": 220,
        "comb_plastic": 500,
        "comb_metal": 900,
        "child_lock": 900,
        "adjustment_window": 750,
        "adjustment_door": 1200
      }
    },
    "roll_nets": {
      "markups": {
        "profit_multiplier": 2,
        "assembly_labor": 250
      },
      "profiles": {
        "standard": 80
      },
      "meshes": {
        "standard": 65
      },
      "components": {
        "accessories_set": 150
      }
    },
    "logistics": {
      "delivery_base": 1000,
      "delivery_km": 50,
      "measurement_fee": 1000,
      "install_plisse_window": 800,
      "install_plisse_door": 1200,
      "install_plisse_portal": 2000,
      "install_door_standard": 1000
    }
  },
  "labor": {
    "fixedFrame": 250,
    "masterAntiExtra": 100,
    "ralPaintingRate": 250
  }
} as const;

export type LegacyParityPriceCatalog = typeof LEGACY_PARITY_PRICE_CATALOG;
