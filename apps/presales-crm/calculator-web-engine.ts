export enum ProductType {
  FRAME = 'Рамочные',
  WING = 'КРЫЛО',
  DOOR = 'Дверные',
  ROLL = 'Рулонные',
  PLISSE_NET = 'Плиссе Сетки',
  JALOUSIE_CLASSIC = 'ШТОРЫ плиссе ПОРТАЛ',
  JALOUSIE_LIGHT = 'ШТОРЫ плиссе ЛАЙТ',
  JALOUSIE_COZY = 'ШТОРЫ плиссе УЮТ +',
  INSIDE_INSERT = 'Внутривставные',
  SEAL = 'Уплотнительная резинка',
  COMB = 'Гребенка',
  CHILD_LOCK = 'Детский замок',
  ADJUSTMENT = 'Регулировка'
}

export type ColorType =
  | 'white' | 'brown' | 'gray' | 'ral' | 'unpainted' | 'anthracite' | 'beige' | 'black' | 'gold' | 'gray7040';
export type MeshType =
  | 'standard' | 'anticat' | 'antipyl' | 'antimoshka' | 'antikoshka' | 'antimosquito' | 'antipollen'
  | 'fb1601' | 'fb1602' | 'fb1603' | 'fb1604' | 'fb1605' | 'fb1606' | 'fb1607'
  | 'fa1621' | 'fa1622' | 'fa1623' | 'fa1624' | 'fa1625' | 'fa1626' | 'fa1627'
  | 'full_blackout' | 'semi_blackout';
export type MountType = 'standard' | 'z_metal' | 'plunger';
export type CornerType = 'plastic' | 'aluminum';
export type HandleType = 'plastic' | 'metal';
export type PlisseOpening = 'side' | 'up' | 'counter';
export type PlisseThreshold = 'standard' | 'low' | 'reinforced';

export interface PriceInput {
  price_settings: any;
}

export interface CalcInput {
  type: ProductType;
  width: number;
  height: number;
  color: ColorType;
  mesh: MeshType;
  opening: PlisseOpening;
  threshold: PlisseThreshold;
  handles: number;
  quantity: number;
  subType: 'window' | 'door' | 'pvc' | 'alu';
  mount: MountType;
  cornerType: CornerType;
  handleType: HandleType;
  doorProfile?: '32' | '42';
  hingesCount?: number;
  hasLatch?: boolean;
  hasBolt?: boolean;
  frameProfile?: '25' | '32';
}

export function roundToTens(value: number): number {
  return Math.round(value / 10) * 10;
}

function calcClassic(input: CalcInput, prices: PriceInput): { total: number; install: number } {
  const CF = prices.price_settings.classic_frames;
  const wM = input.width / 1000;
  const hM = input.height / 1000;
  const isRAL = input.color === 'ral';
  const lookupColor = (isRAL || input.color === 'unpainted' || input.color === 'anthracite' || input.color === 'beige')
    ? 'white'
    : input.color;
  const effCorner = isRAL ? 'aluminum' : input.cornerType;
  const effHandle = isRAL ? 'metal' : input.handleType;
  const effMount = isRAL && input.mount === 'standard' ? 'z_metal' : input.mount;
  const perimeter = (wM + hM) * 2;
  const areaMesh = (wM + 0.1) * (hM + 0.1);
  const waste = CF.markups.profile_waste_factor || 1.1;

  let pPrice = 0;
  let cPrice = 0;

  if (input.type === ProductType.FRAME) {
    const profKey = (input.frameProfile || '25') === '25' ? 'standard_25mm' : 'standard_32mm';
    pPrice = CF.profiles[profKey]?.[lookupColor] ?? CF.profiles[profKey]?.white ?? 0;
    cPrice = (input.frameProfile || '25') === '25'
      ? (CF.corners[effCorner === 'aluminum' ? 'aluminum_25mm' : 'plastic_25mm']?.[lookupColor] ?? 5)
      : (CF.corners.plastic_32mm?.[lookupColor] ?? 19);
  } else if (input.type === ProductType.DOOR) {
    const profKey = (input.doorProfile || '42') === '32' ? 'standard_32mm' : 'door_42mm';
    pPrice = CF.profiles[profKey]?.[lookupColor] ?? CF.profiles[profKey]?.white ?? 0;
    cPrice = CF.corners.door_42mm_internal_external;
  } else if (input.type === ProductType.WING) {
    pPrice = CF.profiles.wing_30mm?.[lookupColor] ?? CF.profiles.wing_30mm?.white ?? 0;
    cPrice = CF.corners.plastic_25mm?.[lookupColor] ?? CF.corners.plastic_25mm?.white ?? 0;
  } else {
    pPrice = CF.profiles.vsn_vsm_25mm?.[lookupColor] ?? CF.profiles.vsn_vsm_25mm?.white ?? 0;
    cPrice = CF.corners.vsn_vsm_25mm?.[lookupColor] ?? CF.corners.vsn_vsm_25mm?.white ?? 0;
  }

  const mPrice = CF.meshes[input.mesh] ?? CF.meshes.standard ?? 65;
  const cordCost = perimeter * CF.mounts.cord_5mm;
  const mountCost = effMount === 'plunger'
    ? 4 * CF.mounts.pin_41mm
    : perimeter * ((effMount === 'z_metal' ? CF.mounts.z_metal : CF.mounts.z_plastic)?.[lookupColor] ?? 0);
  let materials = (perimeter * pPrice * waste) + (4 * cPrice) + (areaMesh * mPrice) + cordCost + mountCost;

  if (hM > 1.0 && (input.type === ProductType.FRAME || input.type === ProductType.WING)) {
    const impP = CF.profiles.impost_25mm?.[lookupColor] ?? CF.profiles.impost_25mm?.white ?? 0;
    materials += (wM * impP * waste) + (2 * CF.mounts.impost_bracket) + (12 * CF.mounts.screw);
  }

  if (input.type === ProductType.DOOR) {
    const hingePrice = CF.hinges_42mm.standard?.[lookupColor] ?? CF.hinges_42mm.standard?.white ?? 0;
    const handlePrice = CF.mounts.handle_door_42mm?.[lookupColor] ?? CF.mounts.handle_door_42mm?.white ?? 0;
    const latchPrice = input.hasLatch ? (CF.mounts.door_latch?.[lookupColor] ?? CF.mounts.door_latch?.white ?? 0) : 0;
    materials += (input.hingesCount || 3) * hingePrice + handlePrice + latchPrice + (input.hasBolt ? CF.mounts.door_bolt : 0);
  } else {
    const hp = effHandle === 'metal' ? CF.mounts.handle_frame_metal : CF.mounts.handle_frame_plastic;
    materials += hp?.[lookupColor] ?? hp?.white ?? 0;
  }

  const labor = input.type === ProductType.DOOR ? CF.markups.door_assembly_labor : CF.markups.assembly_labor;
  const profitMult = input.type === ProductType.DOOR ? CF.markups.door_profit_multiplier : CF.markups.company_profit_multiplier;
  let total = (materials + labor) * profitMult;

  if (isRAL) {
    total += Math.max(CF.markups.ral_surcharge, Math.ceil(perimeter) * (CF.markups.ral_painting_rate_m ?? 220));
  }

  if (input.type === ProductType.FRAME) {
    const mins: Record<string, number> = {
      standard: 1400,
      antimosquito: 1980,
      antimoshka: 1980,
      anticat: 2400,
      antipollen: 3000,
      antipyl: 3000
    };
    total = Math.max(total, mins[input.mesh] ?? 1400);
  }

  return { total, install: input.type === ProductType.DOOR ? 1000 : 800 };
}

function calcPlisseNet(input: CalcInput, prices: PriceInput): { total: number; install: number } {
  const PN = prices.price_settings.plisse_nets;
  const wM = input.width / 1000;
  const hM = input.height / 1000;
  const isCounter = input.opening === 'counter';
  const lookupColor = input.color === 'ral'
    ? 'white'
    : (input.color === 'unpainted' || input.color === 'anthracite' || input.color === 'beige' || input.color === 'brown')
      ? input.color
      : 'white';

  const wDet = Math.max(0, wM - 0.052);
  const hDet = Math.max(0, hM - 0.052);
  const lFrame = ((wDet * 2) + (hDet * 2)) * 1.0116;
  const lSash = isCounter ? (hDet * 2) : (input.opening === 'up' ? wDet : hDet);
  const qtyMesh = (wM * hM) * 1.5054;

  const sumMaterials =
    lFrame * PN.profiles.frame[lookupColor] +
    lSash * PN.profiles.sash[lookupColor] +
    qtyMesh * (PN.meshes[input.mesh] ?? PN.meshes.standard) +
    (isCounter ? wDet * 2 : (input.opening === 'up' ? wDet * 2 : hDet * 2)) * PN.components.insert_mesh_m +
    (lFrame * 0.5) * PN.components.insert_frame_m +
    (isCounter ? ((wM + hM) * 16 + 3.2) : ((wM + hM) * 4 + 0.8)) * PN.components.thread_m +
    (isCounter ? 2 : 1) * PN.components.accessories_set +
    (isCounter ? 16 * PN.components.rivet_pc : 0) +
    (isCounter ? 16 * PN.components.stopper_pc : 0) +
    (isCounter ? (hDet * 2) * PN.components.magnetic_strip_m : 0) +
    (input.threshold === 'low' ? wDet * PN.components.low_threshold_m : 0) +
    input.handles * (PN.components.handle_standard || 90) +
    PN.components.packaging;

  const workAssembly = (wM * hM) * (isCounter ? PN.markups.assembly_rate_meeting : PN.markups.assembly_rate_standard);
  const subtotal = (sumMaterials + workAssembly) * (PN.markups.profit_multiplier || 3.35);
  let total = subtotal + (subtotal * 0.0357);

  if (input.color === 'ral') {
    const ralMeters = Math.ceil(lFrame + lSash);
    total += Math.max(1000, ralMeters * (PN.markups.ral_painting_rate_m ?? 220));
  }

  return { total, install: wM > 1.4 ? 2000 : 1000 };
}

function calcBlinds(input: CalcInput, prices: PriceInput): { total: number; install: number } {
  const PB = prices.price_settings.plisse_blinds;
  const fPrice = input.mesh.startsWith('fb') ? PB.fabrics_m2.full_blackout : PB.fabrics_m2.semi_blackout;
  const wM = input.width / 1000;
  const hM = input.height / 1000;

  if (input.type === ProductType.JALOUSIE_CLASSIC) {
    const PN = prices.price_settings.plisse_nets;
    const isCounter = input.opening === 'counter';
    const lookupColor = input.color === 'ral'
      ? 'white'
      : (input.color === 'unpainted' || input.color === 'anthracite' || input.color === 'beige' || input.color === 'brown')
        ? input.color
        : 'white';
    const wDet = Math.max(0, wM - 0.052);
    const hDet = Math.max(0, hM - 0.052);
    const lFrame = ((wDet * 2) + (hDet * 2)) * 1.0116;
    const lSash = isCounter ? (hDet * 2) : (input.opening === 'up' ? wDet : hDet);
    const sumMaterials =
      lFrame * PN.profiles.frame[lookupColor] +
      lSash * PN.profiles.sash[lookupColor] +
      (wM * hM) * 1.4865 * fPrice +
      (isCounter ? wDet * 2 : (input.opening === 'up' ? wDet * 2 : hDet * 2)) * PN.components.insert_mesh_m +
      (lFrame * 0.5) * PN.components.insert_frame_m +
      (isCounter ? ((wM + hM) * 16 + 3.2) : ((wM + hM) * 4 + 0.8)) * PN.components.thread_m +
      (isCounter ? 2 : 1) * PN.components.accessories_set +
      (isCounter ? 16 * PN.components.rivet_pc : 0) +
      (isCounter ? 16 * PN.components.stopper_pc : 0) +
      (isCounter ? (hDet * 2) * PN.components.magnetic_strip_m : 0) +
      (input.threshold === 'low' ? wDet * PN.components.low_threshold_m : 0) +
      input.handles * (PN.components.handle_standard || 90) +
      PN.components.packaging;
    const workAssembly = (wM * hM) * (isCounter ? PN.markups.assembly_rate_meeting : PN.markups.assembly_rate_standard);
    const subtotal = (sumMaterials + workAssembly) * (PN.markups.profit_multiplier || 3.35);
    let total = subtotal + (subtotal * 0.0357);
    if (input.color === 'ral') {
      const ralMeters = Math.ceil(lFrame + lSash);
      total += Math.max(1000, ralMeters * (PN.markups.ral_painting_rate_m ?? 220));
    }
    return { total, install: wM > 1.4 ? 2000 : 1000 };
  }

  let sumMaterials = 0;
  let workAssembly = (wM * hM) * PB.markups.assembly_rate;
  if (input.type === ProductType.JALOUSIE_LIGHT) {
    sumMaterials = (wM * 2 * PB.lite_system.profile_m) + (wM * hM * 1.4865 * fPrice) + PB.lite_system.accessories_set;
  } else {
    const lookupColor = input.color === 'ral' ? 'white' : input.color;
    const lFrame = (wM + hM) * 2;
    const lSash = input.opening === 'side' ? hM : wM;
    sumMaterials =
      (lFrame * (PB.cozy_system.frame_m[lookupColor] || PB.cozy_system.frame_m.white)) +
      (lSash * (PB.cozy_system.sash_m[lookupColor] || PB.cozy_system.sash_m.white)) +
      (wM * hM * 1.4865 * fPrice) +
      PB.cozy_system.accessories_set;
    workAssembly = (wM * hM) * PB.cozy_system.assembly_rate;
  }

  const subtotal = (sumMaterials + workAssembly) * (PB.markups.profit_multiplier || 3.35);
  let total = subtotal + subtotal * 0.0357;
  if (input.type === ProductType.JALOUSIE_COZY && input.color === 'ral') {
    const lFrame = (wM + hM) * 2;
    const lSash = input.opening === 'side' ? hM : wM;
    const ralMeters = Math.ceil(lFrame + lSash);
    total += Math.max(PB.ral_painting.min_per_item, ralMeters * PB.ral_painting.rate_m);
  }
  return { total, install: 800 };
}

function calcRoll(input: CalcInput, prices: PriceInput): { total: number; install: number } {
  const RN = prices.price_settings.roll_nets;
  const wM = input.width / 1000;
  const hM = input.height / 1000;
  const perimeter = (wM + hM) * 2;
  const area = wM * hM;
  const materials = perimeter * RN.profiles.standard + area * (RN.meshes[input.mesh] ?? RN.meshes.standard) + RN.components.accessories_set;
  const total = (materials + RN.markups.assembly_labor) * RN.markups.profit_multiplier;
  return { total, install: 800 };
}

function calcMaintenance(input: CalcInput, prices: PriceInput): { total: number; install: number } {
  const WW = prices.price_settings.window_works;
  let unitPrice = 0;
  if (input.type === ProductType.SEAL) unitPrice = WW.labor_rates.seal_replacement_m;
  else if (input.type === ProductType.COMB) unitPrice = input.handleType === 'metal' ? WW.labor_rates.comb_metal : WW.labor_rates.comb_plastic;
  else if (input.type === ProductType.CHILD_LOCK) unitPrice = WW.labor_rates.child_lock;
  else if (input.type === ProductType.ADJUSTMENT) unitPrice = input.subType === 'door' ? WW.labor_rates.adjustment_door : WW.labor_rates.adjustment_window;
  return { total: unitPrice * input.quantity, install: 0 };
}

export function calculatePriceWeb(input: CalcInput, prices: PriceInput): { total: number; install: number } {
  let result = { total: 0, install: 0 };
  if ([ProductType.SEAL, ProductType.COMB, ProductType.CHILD_LOCK, ProductType.ADJUSTMENT].includes(input.type)) {
    result = calcMaintenance(input, prices);
    return { total: roundToTens(Math.round(result.total)), install: 0 };
  }
  if ([ProductType.FRAME, ProductType.WING, ProductType.INSIDE_INSERT, ProductType.DOOR].includes(input.type)) {
    result = calcClassic(input, prices);
  } else if (input.type === ProductType.PLISSE_NET) {
    result = calcPlisseNet(input, prices);
  } else if ([ProductType.JALOUSIE_CLASSIC, ProductType.JALOUSIE_LIGHT, ProductType.JALOUSIE_COZY].includes(input.type)) {
    result = calcBlinds(input, prices);
  } else if (input.type === ProductType.ROLL) {
    result = calcRoll(input, prices);
  }

  if (result.total > 0 && result.total < 1200) result.total = 1200;
  return {
    total: roundToTens(Math.round(result.total * input.quantity)),
    install: roundToTens(Math.round(result.install * input.quantity))
  };
}
