import type { CurrentCalculationBusinessRules } from '../calculation-types.js';
import { resolveFrameAssemblyLabor } from '../business-rules.js';

import {
  CORNER_COST_RUB_PER_PIECE,
  CORD_5MM_COST_RUB_PER_M,
  FRAME_PROFILE_25_COST_RUB_PER_M,
  IMPOST_CONNECTOR_COST_RUB,
  IMPOST_COST_RUB_PER_M,
  MESH_ACTUAL_COST_RUB_PER_M2,
  type ActualCostMeshType,
  type ActualCostProfileColor,
} from './actual-cost-catalog-v1.js';
import { LINEAR_PROFILE_WASTE_RATE, MESH_WASTE_RATE } from './actual-cost-config.js';

export interface FrameBomCostInput {
  widthMm: number;
  heightMm: number;
  profileColor: ActualCostProfileColor;
  meshType: ActualCostMeshType;
  fastening: 'Z_METAL' | 'PLUNGER';
  frameProfile?: '25' | '32';
  businessRules: CurrentCalculationBusinessRules;
}

export interface FrameBomCostBreakdown {
  profileRub: number;
  impostRub: number;
  meshRub: number;
  cornersRub: number;
  cordRub: number;
  impostConnectorsRub: number;
  baseMaterialsRub: number;
  wasteRub: number;
  materialsAfterWasteRub: number;
  manufacturingLaborRub: number;
  totalProductDirectCostRub: number;
  quantities: {
    profileMeters: number;
    impostMeters: number;
    meshM2: number;
    corners: number;
    cordMeters: number;
    impostConnectors: number;
  };
}

function ceilMeters(mm: number): number {
  return Math.ceil(mm / 1000);
}

function perimeterMeters(widthMm: number, heightMm: number): number {
  return (2 * (widthMm + heightMm)) / 1000;
}

function impostApplies(heightMm: number): boolean {
  return heightMm > 1000;
}

export function calculateFrameBomCost(input: FrameBomCostInput): FrameBomCostBreakdown {
  const { widthMm, heightMm, profileColor, meshType, fastening, businessRules } = input;

  const perimeter = perimeterMeters(widthMm, heightMm);
  const profileMeters = Math.ceil(perimeter);
  const widthM = widthMm / 1000;
  const heightM = heightMm / 1000;
  const meshM2 = widthM * heightM;

  const profileRub = profileMeters * FRAME_PROFILE_25_COST_RUB_PER_M[profileColor];

  let impostMeters = 0;
  let impostRub = 0;
  let impostConnectors = 0;
  let impostConnectorsRub = 0;
  if (impostApplies(heightMm)) {
    impostMeters = ceilMeters(widthMm);
    impostRub = impostMeters * IMPOST_COST_RUB_PER_M[profileColor];
    impostConnectors = 2;
    impostConnectorsRub = impostConnectors * IMPOST_CONNECTOR_COST_RUB;
  }

  const meshRub = meshM2 * MESH_ACTUAL_COST_RUB_PER_M2[meshType];
  const corners = 4;
  const cornersRub = corners * CORNER_COST_RUB_PER_PIECE[profileColor];
  const cordMeters = profileMeters;
  const cordRub = cordMeters * CORD_5MM_COST_RUB_PER_M;

  const baseMaterialsRub =
    profileRub + impostRub + meshRub + cornersRub + cordRub + impostConnectorsRub;

  const wasteRub =
    profileRub * LINEAR_PROFILE_WASTE_RATE +
    impostRub * LINEAR_PROFILE_WASTE_RATE +
    meshRub * MESH_WASTE_RATE;
  const materialsAfterWasteRub = baseMaterialsRub + wasteRub;

  const manufacturingLaborRub = resolveFrameAssemblyLabor(meshType, fastening, businessRules);

  const totalProductDirectCostRub = materialsAfterWasteRub + manufacturingLaborRub;

  return {
    profileRub,
    impostRub,
    meshRub,
    cornersRub,
    cordRub,
    impostConnectorsRub,
    baseMaterialsRub,
    wasteRub,
    materialsAfterWasteRub,
    manufacturingLaborRub,
    totalProductDirectCostRub,
    quantities: {
      profileMeters,
      impostMeters,
      meshM2,
      corners,
      cordMeters,
      impostConnectors,
    },
  };
}

/** Fixed fixture helper for 600×1800 WHITE STANDARD verification tests. */
export function calculateFrame600x1800WhiteStandardFixture(): FrameBomCostBreakdown {
  return calculateFrameBomCost({
    widthMm: 600,
    heightMm: 1800,
    profileColor: 'WHITE',
    meshType: 'STANDARD',
    fastening: 'Z_METAL',
    frameProfile: '25',
    businessRules: {
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
      plisseMeshPriceReference: {},
    },
  });
}
