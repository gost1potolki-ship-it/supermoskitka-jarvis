// Вспомогательный скрипт для QA-проверки PlisseNetEngine по дефолтным константам

const PN = {
  markups: {
    profit_multiplier: 3.35,
    assembly_rate_standard: 750,
    assembly_rate_meeting: 800,
    waste_factor: 1.11,
    ral_painting_rate_m: 220,
  },
  profiles: {
    frame: { white: 163, brown: 169, unpainted: 130, anthracite: 169, ral: 163 },
    sash: { white: 263, brown: 275, unpainted: 192, anthracite: 273, ral: 263 },
  },
  meshes: {
    standard: 255,
    antikoshka: 700,
    antipyl: 650,
  },
  components: {
    insert_mesh_m: 34,
    insert_frame_m: 36,
    handle_standard: 90,
    thread_m: 7,
    rivet_pc: 6,
    stopper_pc: 5,
    accessories_set: 270,
    packaging: 50,
    magnetic_strip_m: 51,
    low_threshold_m: 220,
  },
};

function plisseNetEngineCalculate(wM, hM, color, mesh, opening, threshold, handles) {
  const mult = PN.markups.profit_multiplier || 3.35;
  const isCounter = opening === 'counter';

  const lookupColor =
    color === 'ral'
      ? 'unpainted'
      : color === 'unpainted' || color === 'anthracite' || color === 'beige' || color === 'brown'
      ? color
      : 'white';

  const wDet = Math.max(0, wM - 0.052);
  const hDet = Math.max(0, hM - 0.052);

  const lFrame = ((wDet * 2 + hDet * 2) * 1.0116);
  const lSash = isCounter ? hDet * 2 : opening === 'up' ? wDet : hDet;
  const qtyMesh = wM * hM * 1.5054;

  const matFrame = lFrame * PN.profiles.frame[lookupColor];
  const matSash = lSash * PN.profiles.sash[lookupColor];
  const matMesh =
    qtyMesh * (PN.meshes[mesh] !== undefined ? PN.meshes[mesh] : PN.meshes.standard);

  const matInsertMesh =
    (isCounter ? wDet * 2 : opening === 'up' ? wDet * 2 : hDet * 2) *
    PN.components.insert_mesh_m;

  const matInsertFrame = (lFrame * 0.5) * PN.components.insert_frame_m;

  const matThread = isCounter
    ? ((wM + hM) * 16 + 3.2) * PN.components.thread_m
    : ((wM + hM) * 4 + 0.8) * PN.components.thread_m;

  const matAcc = (isCounter ? 2 : 1) * PN.components.accessories_set;
  const matRivets = isCounter ? 16 * PN.components.rivet_pc : 0;
  const matStoppers = isCounter ? 16 * PN.components.stopper_pc : 0;
  const matMagnetic = isCounter ? hDet * 2 * PN.components.magnetic_strip_m : 0;
  const matThreshold = threshold === 'low' ? wDet * PN.components.low_threshold_m : 0;
  const matHandles = handles * (PN.components.handle_standard || 90);

  const sumMaterials =
    matFrame +
    matSash +
    matMesh +
    matInsertMesh +
    matInsertFrame +
    matThread +
    matAcc +
    matRivets +
    matStoppers +
    matMagnetic +
    matThreshold +
    matHandles +
    PN.components.packaging;

  const workAssembly =
    wM * hM * (isCounter ? PN.markups.assembly_rate_meeting : PN.markups.assembly_rate_standard);

  let subtotal = (sumMaterials + workAssembly) * mult;
  if (color === 'ral') {
    subtotal += (lFrame + lSash) * (PN.markups.ral_painting_rate_m || 220);
  }

  const wasteLine = subtotal * 0.0357;
  const total = subtotal + wasteLine;

  return { total, install: wM > 1.4 ? 2000 : 1000 };
}

function parseOpening(str) {
  if (str === 'вверх') return 'up';
  if (str === 'вправо' || str === 'влево') return 'side';
  if (str === 'встречное') return 'counter';
  throw new Error('Unknown opening: ' + str);
}

function parseMesh(str) {
  if (str.toLowerCase() === 'стандарт') return 'standard';
  if (str.toLowerCase() === 'антипыль') return 'antipyl';
  if (str.toLowerCase() === 'антикот' || str.toLowerCase() === 'антикот' || str.toLowerCase() === 'антикот') {
    return 'antikoshka';
  }
  throw new Error('Unknown mesh: ' + str);
}

function parseColor(str) {
  const s = str.toLowerCase();
  if (s === 'белый') return 'white';
  if (s === 'коричневый') return 'brown';
  if (s === 'серый') return 'gray';
  if (s === 'ral') return 'ral';
  throw new Error('Unknown color: ' + str);
}

const cases = [
  ['800x1500', 'вверх', 'стандарт', 'белый', 'рамный'],
  ['900x1600', 'вверх', 'антипыль', 'серый', 'рамный'],
  ['1000x1700', 'вверх', 'стандарт', 'коричневый', 'рамный'],
  ['800x2000', 'вправо', 'стандарт', 'белый', 'рамный'],
  ['900x2100', 'влево', 'антипыль', 'коричневый', 'рамный'],
  ['1200x2200', 'вправо', 'антиКОТ', 'серый', 'рамный'],
  ['1300x2100', 'влево', 'стандарт', 'белый', 'рамный'],
  ['1400x2300', 'вправо', 'антипыль', 'серый', 'рамный'],
  ['1500x2200', 'встречное', 'стандарт', 'белый', 'рамный'],
  ['1600x2300', 'встречное', 'антиКОТ', 'коричневый', 'рамный'],
];

const results = cases.map((c, idx) => {
  const [size, openingRu, meshRu, colorRu] = c;
  const [wStr, hStr] = size.split('x');
  const width = parseFloat(wStr) / 1000;
  const height = parseFloat(hStr) / 1000;
  const opening = parseOpening(openingRu);
  const mesh = parseMesh(meshRu.toLowerCase());
  const color = parseColor(colorRu);

  const area = width * height;
  const { total } = plisseNetEngineCalculate(
    width,
    height,
    color,
    mesh,
    opening,
    'standard',
    1
  );

  return {
    index: idx + 1,
    size,
    openingRu,
    meshRu,
    colorRu,
    profile: 'рамный',
    area,
    total,
  };
});

console.log(JSON.stringify(results, null, 2));

