/**
 * Округление до десятков рублей (итоговая стоимость позиции).
 * Примеры: 8179 → 8180, 6112 → 6110.
 */
export function roundToTens(value: number): number {
  return Math.round(value / 10) * 10;
}

/**
 * ИЗОЛЯЦИЯ ГРУПП: каждая группа использует только свои данные из constants:
 * - ClassicEngine  → classic_frames   (рамочные, крыло, внутривставные, дверные)
 * - PlisseNetEngine → plisse_nets    (плиссе сетки)
 * - BlindsEngine  → plisse_blinds    (шторы плиссе Лайт, Уют)
 *   ИСКЛЮЧЕНИЕ: Штора Портал (JALOUSIE_CLASSIC) = логика plisse_nets + ткани plisse_blinds.fabrics_m2
 * - RollEngine    → roll_nets        (рулонные)
 * - MaintenanceEngine → window_works
 */
import { PRICES as DEFAULT_PRICES } from '../constants';
import { 
  ProductType, 
  ColorType, 
  MeshType, 
  PlisseOpening, 
  PlisseThreshold, 
  MountType, 
  CornerType, 
  HandleType 
} from '../types';

/** 
 * ============================================================================
 * ENGINE 1: CLASSIC FRAMES (Рамочные, Крыло, Внутривставные, Двери)
 * ============================================================================
 */
const ClassicEngine = {
  calculate: (
    type: ProductType,
    wM: number,
    hM: number,
    color: ColorType,
    mesh: MeshType,
    mount: MountType,
    cornerType: CornerType,
    handleType: HandleType,
    frameProfile: '25' | '32',
    doorProfile: '32' | '42',
    hingesCount: number,
    hasLatch: boolean,
    hasBolt: boolean,
    prices: typeof DEFAULT_PRICES
  ) => {
    const CF = prices.price_settings.classic_frames;
    const isRAL = color === 'ral';
    const lookupColor = (isRAL || color === 'unpainted' || color === 'anthracite' || color === 'beige') ? 'white' : color;
    
    // Эффективные параметры для RAL
    const effCorner = isRAL ? 'aluminum' : cornerType;
    const effHandle = isRAL ? 'metal' : handleType;
    let effMount = mount;
    if (isRAL && mount === 'standard') effMount = 'z_metal';

    const perimeter = (wM + hM) * 2;
    const areaMesh = (wM + 0.1) * (hM + 0.1);
    const waste = CF.markups.profile_waste_factor || 1.1;
    
    let pPrice = 0, cPrice = 0;
    
    // Выбор цены профиля и углов
    if (type === ProductType.FRAME) {
      const profKey = frameProfile === '25' ? 'standard_25mm' : 'standard_32mm';
      pPrice = (CF.profiles as any)[profKey]?.[lookupColor] ?? (CF.profiles as any)[profKey]?.white;      cPrice = frameProfile === '25' 
        ? (CF.corners[effCorner === 'aluminum' ? 'aluminum_25mm' : 'plastic_25mm'][lookupColor as keyof typeof CF.corners.plastic_25mm] || 5)
        : (CF.corners.plastic_32mm[lookupColor as keyof typeof CF.corners.plastic_32mm] || 19);
    } else if (type === ProductType.DOOR) {
      const profKey = doorProfile === '32' ? 'standard_32mm' : 'door_42mm';
      pPrice = CF.profiles[profKey][lookupColor as keyof typeof CF.profiles.standard_32mm] || CF.profiles[profKey].white;
      cPrice = CF.corners.door_42mm_internal_external;
    } else if (type === ProductType.WING) {
      pPrice = CF.profiles.wing_30mm[lookupColor as keyof typeof CF.profiles.wing_30mm] || CF.profiles.wing_30mm.white;
      cPrice = CF.corners.plastic_25mm[lookupColor as keyof typeof CF.corners.plastic_25mm] || CF.corners.plastic_25mm.white;
    } else if (type === ProductType.INSIDE_INSERT) {
      pPrice = CF.profiles.vsn_vsm_25mm[lookupColor as keyof typeof CF.profiles.vsn_vsm_25mm] || CF.profiles.vsn_vsm_25mm.white;
      cPrice = CF.corners.vsn_vsm_25mm[lookupColor as keyof typeof CF.corners.vsn_vsm_25mm] || CF.corners.vsn_vsm_25mm.white;
    }

    const mPrice = CF.meshes[mesh as keyof typeof CF.meshes] || CF.meshes.standard || 65;
    const cordCost = perimeter * CF.mounts.cord_5mm;
    let mountCost = 0;
    if (effMount === 'plunger') {
      mountCost = 4 * CF.mounts.pin_41mm;
    } else {
      const mountProfile = effMount === 'z_metal' ? CF.mounts.z_metal : CF.mounts.z_plastic;
      mountCost = perimeter * (mountProfile[lookupColor as keyof typeof mountProfile] ?? mountProfile.white);
    }
    let materials = (perimeter * pPrice * waste) + (4 * cPrice) + (areaMesh * mPrice) + cordCost + mountCost;
    
    // Импост
    if (hM > 1.0 && (type === ProductType.FRAME || type === ProductType.WING)) {
      const impP = CF.profiles.impost_25mm[lookupColor as keyof typeof CF.profiles.impost_25mm] || CF.profiles.impost_25mm.white;
      materials += (wM * impP * waste) + (2 * CF.mounts.impost_bracket) + (12 * CF.mounts.screw);
    }

    // Фурнитура
    if (type === ProductType.DOOR) {
      const hingePrice = CF.hinges_42mm.standard[lookupColor as keyof typeof CF.hinges_42mm.standard] ?? CF.hinges_42mm.standard.white;
      const handlePrice = CF.mounts.handle_door_42mm[lookupColor as keyof typeof CF.mounts.handle_door_42mm] ?? CF.mounts.handle_door_42mm.white;
      const latchPrice = hasLatch ? (CF.mounts.door_latch[lookupColor as keyof typeof CF.mounts.door_latch] ?? CF.mounts.door_latch.white) : 0;
      materials += hingesCount * hingePrice + handlePrice + latchPrice + (hasBolt ? CF.mounts.door_bolt : 0);
    } else {
      const handleProfile = effHandle === 'metal' ? CF.mounts.handle_frame_metal : CF.mounts.handle_frame_plastic;
      materials += handleProfile[lookupColor as keyof typeof handleProfile] ?? handleProfile.white;
    }

    const labor = type === ProductType.DOOR ? CF.markups.door_assembly_labor : CF.markups.assembly_labor;
    const profitMult = type === ProductType.DOOR ? CF.markups.door_profit_multiplier : CF.markups.company_profit_multiplier;
    
    let total = (materials + labor) * profitMult;
    // RAL: общая длина профилей округляется до целого метра вверх, × ставка за м; не менее 1000 ₽
    if (isRAL) total += Math.max(CF.markups.ral_surcharge, Math.ceil(perimeter) * (CF.markups.ral_painting_rate_m ?? 220));
    // Заградительная цена только для рамочных сеток (FRAME) по типу полотна
    if (type === ProductType.FRAME) {
      const FRAME_MIN_BY_MESH: Partial<Record<MeshType, number>> = {
        standard: 1400,
        antimosquito: 1980,
        antimoshka: 1980,
        anticat: 2400,
        antipollen: 3000,
        antipyl: 3000
      };
      const minPrice = FRAME_MIN_BY_MESH[mesh] ?? 1400;
      total = Math.max(total, minPrice);
    }
    return { total, install: type === ProductType.DOOR ? 1000 : 800 };
  }
};

/** 
 * ============================================================================
 * ENGINE 2: PLISSE NETS (Сетки Плиссе) - ЭТАЛОННАЯ ТОЧНОСТЬ
 * ============================================================================
 */
const PlisseNetEngine = {
  calculate: (
    wM: number,
    hM: number,
    color: ColorType,
    mesh: MeshType,
    opening: PlisseOpening,
    threshold: PlisseThreshold,
    handles: number,
    prices: typeof DEFAULT_PRICES
  ) => {
    const PN = prices.price_settings.plisse_nets;
    const mult = PN.markups.profit_multiplier || 3.35;
    const isCounter = opening === 'counter';
    
    const lookupColor = (color === 'ral' ? 'white' : (color === 'unpainted' || color === 'anthracite' || color === 'beige' || color === 'brown') ? color : 'white');
    const wDet = Math.max(0, wM - 0.052), hDet = Math.max(0, hM - 0.052);
    
    const lFrame = ((wDet * 2) + (hDet * 2)) * 1.0116; 
    const lSash = isCounter ? (hDet * 2) : (opening === 'up' ? wDet : hDet);
    const qtyMesh = (wM * hM) * 1.5054; // Скорректировано для 2.0*2.6 = 7.828

    const matFrame = lFrame * PN.profiles.frame[lookupColor as keyof typeof PN.profiles.frame];
    const matSash = lSash * PN.profiles.sash[lookupColor as keyof typeof PN.profiles.sash];
    const matMesh = qtyMesh * (PN.meshes[mesh as keyof typeof PN.meshes] || PN.meshes.standard);
    const matInsertMesh = (isCounter ? wDet * 2 : (opening === 'up' ? wDet * 2 : hDet * 2)) * PN.components.insert_mesh_m;
    const matInsertFrame = (lFrame * 0.5) * PN.components.insert_frame_m;
    
    // Нить
    const matThread = isCounter 
      ? ((wM + hM) * 16 + 3.2) * PN.components.thread_m 
      : ((wM + hM) * 4 + 0.8) * PN.components.thread_m;

    const matAcc = (isCounter ? 2 : 1) * PN.components.accessories_set;
    const matRivets = isCounter ? 16 * PN.components.rivet_pc : 0;
    const matStoppers = isCounter ? 16 * PN.components.stopper_pc : 0;
    const matMagnetic = isCounter ? (hDet * 2) * PN.components.magnetic_strip_m : 0;
    const matThreshold = threshold === 'low' ? wDet * PN.components.low_threshold_m : 0;
    const matHandles = handles * (PN.components.handle_standard || 90);
    
    const sumMaterials = matFrame + matSash + matMesh + matInsertMesh + matInsertFrame + matThread + matAcc + matRivets + matStoppers + matMagnetic + matThreshold + matHandles + PN.components.packaging;
    const workAssembly = (wM * hM) * (isCounter ? PN.markups.assembly_rate_meeting : PN.markups.assembly_rate_standard);
    
    let subtotal = (sumMaterials + workAssembly) * mult;
    const wasteLine = subtotal * 0.0357; // Эталонный процент
    let total = subtotal + wasteLine;
    // RAL: цена как у белого + покраска (длина профилей до целого м вверх × 220 ₽/м, не менее 1000 ₽)
    if (color === 'ral') {
      const ralMeters = Math.ceil(lFrame + lSash);
      const ralPainting = Math.max(1000, ralMeters * (PN.markups.ral_painting_rate_m ?? 220));
      total += ralPainting;
    }

    return { total, install: wM > 1.4 ? 2000 : 1000 };
  }
};

/** 
 * ============================================================================
 * ENGINE 3: PLISSE BLINDS (Шторы Плиссе)
 * ============================================================================
 */
const BlindsEngine = {
  calculate: (
    type: ProductType,
    wM: number,
    hM: number,
    color: ColorType,
    mesh: MeshType,
    opening: PlisseOpening,
    threshold: PlisseThreshold,
    handles: number,
    prices: typeof DEFAULT_PRICES
  ) => {
    const PB = prices.price_settings.plisse_blinds;
    const mult = PB.markups.profit_multiplier || 3.35;
    const fPrice = mesh.startsWith('fb') ? PB.fabrics_m2.full_blackout : PB.fabrics_m2.semi_blackout;

    // ИСКЛЮЧЕНИЕ: Штора Портал = плиссе-сетка с тканью вместо сетки. Профиль, фурнитура, логика — из plisse_nets.
    if (type === ProductType.JALOUSIE_CLASSIC) {
      const PN = prices.price_settings.plisse_nets;
      const isCounter = opening === 'counter';
      const lookupColor = (color === 'ral' ? 'white' : (color === 'unpainted' || color === 'anthracite' || color === 'beige' || color === 'brown') ? color : 'white');
      const wDet = Math.max(0, wM - 0.052), hDet = Math.max(0, hM - 0.052);
      const lFrame = ((wDet * 2) + (hDet * 2)) * 1.0116;
      const lSash = isCounter ? (hDet * 2) : (opening === 'up' ? wDet : hDet);

      const matFrame = lFrame * PN.profiles.frame[lookupColor as keyof typeof PN.profiles.frame];
      const matSash = lSash * PN.profiles.sash[lookupColor as keyof typeof PN.profiles.sash];
      const matFabric = (wM * hM) * 1.4865 * fPrice; // Ткань вместо сетки (PB.fabrics_m2)
      const matInsertMesh = (isCounter ? wDet * 2 : (opening === 'up' ? wDet * 2 : hDet * 2)) * PN.components.insert_mesh_m;
      const matInsertFrame = (lFrame * 0.5) * PN.components.insert_frame_m;
      const matThread = isCounter ? ((wM + hM) * 16 + 3.2) * PN.components.thread_m : ((wM + hM) * 4 + 0.8) * PN.components.thread_m;
      const matAcc = (isCounter ? 2 : 1) * PN.components.accessories_set;
      const matRivets = isCounter ? 16 * PN.components.rivet_pc : 0;
      const matStoppers = isCounter ? 16 * PN.components.stopper_pc : 0;
      const matMagnetic = isCounter ? (hDet * 2) * PN.components.magnetic_strip_m : 0;
      const matThreshold = threshold === 'low' ? wDet * PN.components.low_threshold_m : 0;
      const matHandles = handles * (PN.components.handle_standard || 90);

      const sumMaterials = matFrame + matSash + matFabric + matInsertMesh + matInsertFrame + matThread + matAcc + matRivets + matStoppers + matMagnetic + matThreshold + matHandles + PN.components.packaging;
      const workAssembly = (wM * hM) * (isCounter ? PN.markups.assembly_rate_meeting : PN.markups.assembly_rate_standard);
      let subtotal = (sumMaterials + workAssembly) * (PN.markups.profit_multiplier || 3.35);
      let total = subtotal + (subtotal * 0.0357);
      if (color === 'ral') {
        const ralMeters = Math.ceil(lFrame + lSash);
        total += Math.max(1000, ralMeters * (PN.markups.ral_painting_rate_m ?? 220));
      }
      return { total, install: wM > 1.4 ? 2000 : 1000 };
    }

    let sumMaterials = 0;
    let workAssembly = (wM * hM) * PB.markups.assembly_rate;

    if (type === ProductType.JALOUSIE_LIGHT) {
      sumMaterials = (wM * 2 * PB.lite_system.profile_m) + (wM * hM * 1.4865 * fPrice) + PB.lite_system.accessories_set;
    }
    else if (type === ProductType.JALOUSIE_COZY) {
      const lookupColor = color === 'ral' ? 'white' : color;
      const lFrame = (wM + hM) * 2;
      const lSash = opening === 'side' ? hM : wM;
      sumMaterials = (lFrame * (PB.cozy_system.frame_m[lookupColor as keyof typeof PB.cozy_system.frame_m] || PB.cozy_system.frame_m.white)) + 
                     (lSash * (PB.cozy_system.sash_m[lookupColor as keyof typeof PB.cozy_system.sash_m] || PB.cozy_system.sash_m.white)) + 
                     (wM * hM * 1.4865 * fPrice) + PB.cozy_system.accessories_set;
      workAssembly = (wM * hM) * PB.cozy_system.assembly_rate;
    }

    const subtotal = (sumMaterials + workAssembly) * mult;
    let total = subtotal + (subtotal * 0.0357);
    if (type === ProductType.JALOUSIE_COZY && color === 'ral') {
      const lFrame = (wM + hM) * 2;
      const lSash = opening === 'side' ? hM : wM;
      const ralMeters = Math.ceil(lFrame + lSash);
      total += Math.max(PB.ral_painting.min_per_item, ralMeters * PB.ral_painting.rate_m);
    }

    return { total, install: 800 };
  }
};

/** 
 * ============================================================================
 * ENGINE 4: ROLL NETS (Рулонные) — изолированная группа
 * ============================================================================
 */
const RollEngine = {
  calculate: (wM: number, hM: number, mesh: MeshType, prices: typeof DEFAULT_PRICES) => {
    const RN = prices.price_settings.roll_nets;
    const perimeter = (wM + hM) * 2;
    const area = wM * hM;
    const pPrice = RN.profiles.standard;
    const mPrice = RN.meshes[mesh as keyof typeof RN.meshes] ?? RN.meshes.standard;
    const materials = perimeter * pPrice + area * mPrice + RN.components.accessories_set;
    const total = (materials + RN.markups.assembly_labor) * RN.markups.profit_multiplier;
    return { total, install: 800 };
  }
};

/** 
 * ============================================================================
 * ENGINE 5: MAINTENANCE (Обслуживание)
 * ============================================================================
 */
const MaintenanceEngine = {
  calculate: (
    type: ProductType,
    quantity: number,
    subType: 'window' | 'door' | 'pvc' | 'alu',
    handleType: HandleType,
    prices: typeof DEFAULT_PRICES
  ) => {
    const WW = prices.price_settings.window_works;
    let unitPrice = 0;

    switch (type) {
      case ProductType.SEAL: unitPrice = WW.labor_rates.seal_replacement_m; break;
      case ProductType.COMB: unitPrice = handleType === 'metal' ? WW.labor_rates.comb_metal : WW.labor_rates.comb_plastic; break;
      case ProductType.CHILD_LOCK: unitPrice = WW.labor_rates.child_lock; break;
      case ProductType.ADJUSTMENT: unitPrice = subType === 'door' ? WW.labor_rates.adjustment_door : WW.labor_rates.adjustment_window; break;
    }

    return { total: unitPrice * quantity, install: 0 };
  }
};

/** 
 * ============================================================================
 * MAIN ROUTER: calculatePrice
 * ============================================================================
 */
export function calculatePrice(
  type: ProductType,
  width: number,
  height: number,
  color: ColorType,
  mesh: MeshType,
  opening: PlisseOpening,
  threshold: PlisseThreshold,
  handles: number,
  quantity: number,
  subType: 'window' | 'door' | 'pvc' | 'alu',
  mount: MountType,
  cornerType: CornerType,
  handleType: HandleType,
  prices: typeof DEFAULT_PRICES,
  doorProfile: '32' | '42' = '42',
  hingesCount: number = 3,
  hasLatch: boolean = true,
  hasBolt: boolean = false,
  frameProfile: '25' | '32' = '25'
): { total: number; install: number } {
  const wM = width / 1000, hM = height / 1000;
  let result = { total: 0, install: 0 };

  // 1. Блок Обслуживания
  if ([ProductType.SEAL, ProductType.COMB, ProductType.CHILD_LOCK, ProductType.ADJUSTMENT].includes(type)) {
    result = MaintenanceEngine.calculate(type, quantity, subType, handleType, prices);
    return { total: roundToTens(Math.round(result.total)), install: 0 };
  }

  // 2. Блок Классики
  if ([ProductType.FRAME, ProductType.WING, ProductType.INSIDE_INSERT, ProductType.DOOR].includes(type)) {
    result = ClassicEngine.calculate(type, wM, hM, color, mesh, mount, cornerType, handleType, frameProfile, doorProfile, hingesCount, hasLatch, hasBolt, prices);
  } 
  // 3. Блок Плиссе Сеток
  else if (type === ProductType.PLISSE_NET) {
    result = PlisseNetEngine.calculate(wM, hM, color, mesh, opening, threshold, handles, prices);
  } 
  // 4. Блок Штор Плиссе
  else if ([ProductType.JALOUSIE_CLASSIC, ProductType.JALOUSIE_LIGHT, ProductType.JALOUSIE_COZY].includes(type)) {
    result = BlindsEngine.calculate(type, wM, hM, color, mesh, opening, threshold, handles, prices);
  }
  // 5. Блок Рулонные
  else if (type === ProductType.ROLL) {
    result = RollEngine.calculate(wM, hM, mesh, prices);
  }

  // Минимальный порог цены
  if (result.total > 0 && result.total < 1200) result.total = 1200;

  return { 
    total: roundToTens(Math.round(result.total * quantity)), 
    install: roundToTens(Math.round(result.install * quantity)) 
  };
}
