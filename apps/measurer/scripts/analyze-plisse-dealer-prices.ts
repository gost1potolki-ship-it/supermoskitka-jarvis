import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRICES } from '../constants';
import { calculatePrice } from '../logic/calculations';
import { ProductType, type ColorType, type MeshType, type PlisseOpening, type PlisseThreshold } from '../types';

type SizeCase = {
  width: number;
  height: number;
};

type MeshGroupKey = 'standard' | 'special';

type VariantPriceRow = {
  color: ColorType;
  mesh: MeshType;
  opening: PlisseOpening;
  width: number;
  height: number;
  areaM2: number;
  totalRub: number;
  rubPerM2: number;
  areaRange: string;
};

type GroupedSizeRow = {
  colorGroupLabel: string;
  meshGroupKey: MeshGroupKey;
  meshGroupLabel: string;
  opening: PlisseOpening;
  openingLabel: string;
  width: number;
  height: number;
  areaM2: number;
  totalRub: number;
  rubPerM2: number;
  dealerTotalRubDiscount30: number;
  dealerRubPerM2Discount30: number;
  areaRange: string;
  sourceVariants: number;
};

type SummaryRow = {
  colorGroupLabel: string;
  meshGroupKey: MeshGroupKey;
  meshGroupLabel: string;
  opening: PlisseOpening;
  openingLabel: string;
  minRubPerM2: number;
  maxRubPerM2: number;
  avgRubPerM2: number;
  recommendedRubPerM2: number;
  dealerRubPerM2Discount30: number;
  spreadPct: number;
  recommendation: 'можно использовать одну цену' | 'лучше использовать диапазоны';
  comment: string;
};

type RangeSummaryRow = {
  colorGroupLabel: string;
  meshGroupKey: MeshGroupKey;
  meshGroupLabel: string;
  opening: PlisseOpening;
  openingLabel: string;
  areaRange: string;
  minRubPerM2: number;
  maxRubPerM2: number;
  avgRubPerM2: number;
  recommendedRubPerM2: number;
  samples: number;
};

const CHECK_SIZES: SizeCase[] = [
  { width: 600, height: 1200 },
  { width: 800, height: 1600 },
  { width: 1000, height: 2000 },
  { width: 1200, height: 2200 },
  { width: 1400, height: 2400 },
  { width: 1600, height: 2500 },
];

const BASE_COLORS: ColorType[] = ['white', 'brown', 'anthracite'];
const OPENINGS: PlisseOpening[] = ['side', 'up', 'counter'];

const COLOR_GROUP_LABEL = 'Базовые цвета профиля: белый / коричневый / серый (антрацит)';
const FIXED_HANDLES = 2;
const FIXED_THRESHOLD: PlisseThreshold = 'standard';
const SPREAD_THRESHOLD_PCT = 15;
const ROUND_STEP_RUB = 50;
const DEALER_DISCOUNT_FACTOR = 0.7;

const OPENING_LABELS: Record<PlisseOpening, string> = {
  side: 'Боковое открывание',
  up: 'Вертикальное открывание',
  counter: 'Встречное открывание',
};

const ORDERED_AREA_RANGES = ['до 1 м²', 'от 1 до 2 м²', 'от 2 до 3 м²', 'более 3 м²'] as const;

const availablePlisseMeshes = Object.keys(PRICES.price_settings.plisse_nets.meshes) as MeshType[];
const SPECIAL_MESH_CANDIDATES: MeshType[] = ['antipyl', 'antikoshka', 'antimoshka'];
const MESH_GROUPS: Record<MeshGroupKey, { label: string; meshes: MeshType[] }> = {
  standard: {
    label: 'Стандарт',
    meshes: ['standard'],
  },
  special: {
    label: 'Специальное полотно: Антипыль / Антикошка / Антимошка',
    meshes: SPECIAL_MESH_CANDIDATES.filter((mesh): mesh is MeshType => availablePlisseMeshes.includes(mesh)),
  },
};

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function toAreaRange(areaM2: number): string {
  if (areaM2 <= 1) return 'до 1 м²';
  if (areaM2 <= 2) return 'от 1 до 2 м²';
  if (areaM2 <= 3) return 'от 2 до 3 м²';
  return 'более 3 м²';
}

function mean(values: number[]): number {
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function roundRub(value: number): number {
  return Math.round(value);
}

function toMarkdownTable(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(' | ')} |`;
  const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return `${headerLine}\n${sepLine}\n${body}`;
}

const rawRows: VariantPriceRow[] = [];

for (const color of BASE_COLORS) {
  for (const opening of OPENINGS) {
    for (const meshGroup of Object.values(MESH_GROUPS)) {
      for (const mesh of meshGroup.meshes) {
        for (const sizeCase of CHECK_SIZES) {
          const areaM2 = Number(((sizeCase.width * sizeCase.height) / 1_000_000).toFixed(4));
          const result = calculatePrice(
            ProductType.PLISSE_NET,
            sizeCase.width,
            sizeCase.height,
            color,
            mesh,
            opening,
            FIXED_THRESHOLD,
            FIXED_HANDLES,
            1,
            'window',
            'standard',
            'plastic',
            'plastic',
            PRICES,
            '42',
            3,
            true,
            false,
            '25'
          );

          rawRows.push({
            color,
            mesh,
            opening,
            width: sizeCase.width,
            height: sizeCase.height,
            areaM2,
            totalRub: result.total,
            rubPerM2: Number((result.total / areaM2).toFixed(2)),
            areaRange: toAreaRange(areaM2),
          });
        }
      }
    }
  }
}

const groupedBySizeAndBuckets = new Map<string, VariantPriceRow[]>();
for (const row of rawRows) {
  for (const [meshGroupKey, meshGroup] of Object.entries(MESH_GROUPS) as [MeshGroupKey, { label: string; meshes: MeshType[] }][]) {
    if (!meshGroup.meshes.includes(row.mesh)) continue;

    const key = `${meshGroupKey}|${row.opening}|${row.width}|${row.height}`;
    const bucket = groupedBySizeAndBuckets.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      groupedBySizeAndBuckets.set(key, [row]);
    }
  }
}

const groupedSizeRows: GroupedSizeRow[] = [];
for (const [key, rows] of groupedBySizeAndBuckets) {
  const [meshGroupKey, opening, width, height] = key.split('|') as [MeshGroupKey, PlisseOpening, string, string];
  const perM2Values = rows.map((row) => row.rubPerM2);
  const totalValues = rows.map((row) => row.totalRub);
  const area = rows[0].areaM2;

  groupedSizeRows.push({
    colorGroupLabel: COLOR_GROUP_LABEL,
    meshGroupKey,
    meshGroupLabel: MESH_GROUPS[meshGroupKey].label,
    opening,
    openingLabel: OPENING_LABELS[opening],
    width: Number(width),
    height: Number(height),
    areaM2: area,
    totalRub: Number(mean(totalValues).toFixed(2)),
    rubPerM2: Number(mean(perM2Values).toFixed(2)),
    dealerTotalRubDiscount30: roundRub(mean(totalValues) * DEALER_DISCOUNT_FACTOR),
    dealerRubPerM2Discount30: roundRub(mean(perM2Values) * DEALER_DISCOUNT_FACTOR),
    areaRange: toAreaRange(area),
    sourceVariants: rows.length,
  });
}

const groupedSummaryMap = new Map<string, GroupedSizeRow[]>();
for (const row of groupedSizeRows) {
  const key = `${row.meshGroupKey}|${row.opening}`;
  const bucket = groupedSummaryMap.get(key);
  if (bucket) {
    bucket.push(row);
  } else {
    groupedSummaryMap.set(key, [row]);
  }
}

const summaryRows: SummaryRow[] = [];
const rangeRows: RangeSummaryRow[] = [];

for (const [key, rows] of groupedSummaryMap) {
  const [meshGroupKey, opening] = key.split('|') as [MeshGroupKey, PlisseOpening];
  const values = rows.map((row) => row.rubPerM2);
  const minRubPerM2 = Number(Math.min(...values).toFixed(2));
  const maxRubPerM2 = Number(Math.max(...values).toFixed(2));
  const avgRubPerM2 = Number(mean(values).toFixed(2));
  const spreadPct = Number((((maxRubPerM2 - minRubPerM2) / avgRubPerM2) * 100).toFixed(2));
  const recommendedRubPerM2 = roundUpToStep(maxRubPerM2, ROUND_STEP_RUB);
  const recommendation =
    spreadPct > SPREAD_THRESHOLD_PCT ? 'лучше использовать диапазоны' : 'можно использовать одну цену';

  const specialMeshesPresent = MESH_GROUPS.special.meshes.join(', ');

  summaryRows.push({
    colorGroupLabel: COLOR_GROUP_LABEL,
    meshGroupKey,
    meshGroupLabel: MESH_GROUPS[meshGroupKey].label,
    opening,
    openingLabel: OPENING_LABELS[opening],
    minRubPerM2,
    maxRubPerM2,
    avgRubPerM2,
    recommendedRubPerM2,
    dealerRubPerM2Discount30: roundRub(recommendedRubPerM2 * DEALER_DISCOUNT_FACTOR),
    spreadPct,
    recommendation,
    comment:
      meshGroupKey === 'special' && !specialMeshesPresent.includes('antimoshka')
        ? 'Группа спецполотна рассчитана по Антипыль и Антикошка (Антимошка отсутствует в прайсе плиссе).'
        : recommendation === 'лучше использовать диапазоны'
          ? 'Разброс выше 15%, единая ставка может искажать цену по крупным размерам.'
          : 'Единая ставка по м² укладывается в допустимый разброс на проверочных размерах.',
  });

  const rangeBuckets = new Map<string, GroupedSizeRow[]>();
  for (const row of rows) {
    const bucket = rangeBuckets.get(row.areaRange);
    if (bucket) {
      bucket.push(row);
    } else {
      rangeBuckets.set(row.areaRange, [row]);
    }
  }

  for (const areaRange of ORDERED_AREA_RANGES) {
    const rangeSet = rangeBuckets.get(areaRange);
    if (!rangeSet || rangeSet.length === 0) continue;

    const rangeValues = rangeSet.map((item) => item.rubPerM2);
    rangeRows.push({
      colorGroupLabel: COLOR_GROUP_LABEL,
      meshGroupKey,
      meshGroupLabel: MESH_GROUPS[meshGroupKey].label,
      opening,
      openingLabel: OPENING_LABELS[opening],
      areaRange,
      minRubPerM2: Number(Math.min(...rangeValues).toFixed(2)),
      maxRubPerM2: Number(Math.max(...rangeValues).toFixed(2)),
      avgRubPerM2: Number(mean(rangeValues).toFixed(2)),
      recommendedRubPerM2: roundUpToStep(Math.max(...rangeValues), ROUND_STEP_RUB),
      samples: rangeSet.length,
    });
  }
}

summaryRows.sort((a, b) => {
  const meshOrder: MeshGroupKey[] = ['standard', 'special'];
  const groupOrder = meshOrder.indexOf(a.meshGroupKey) - meshOrder.indexOf(b.meshGroupKey);
  if (groupOrder !== 0) return groupOrder;
  return OPENINGS.indexOf(a.opening) - OPENINGS.indexOf(b.opening);
});

rangeRows.sort((a, b) => {
  const meshOrder: MeshGroupKey[] = ['standard', 'special'];
  const groupOrder = meshOrder.indexOf(a.meshGroupKey) - meshOrder.indexOf(b.meshGroupKey);
  if (groupOrder !== 0) return groupOrder;
  const openingOrder = OPENINGS.indexOf(a.opening) - OPENINGS.indexOf(b.opening);
  if (openingOrder !== 0) return openingOrder;
  return ORDERED_AREA_RANGES.indexOf(a.areaRange as (typeof ORDERED_AREA_RANGES)[number]) -
    ORDERED_AREA_RANGES.indexOf(b.areaRange as (typeof ORDERED_AREA_RANGES)[number]);
});

groupedSizeRows.sort((a, b) => {
  const meshOrder: MeshGroupKey[] = ['standard', 'special'];
  const groupOrder = meshOrder.indexOf(a.meshGroupKey) - meshOrder.indexOf(b.meshGroupKey);
  if (groupOrder !== 0) return groupOrder;
  const openingOrder = OPENINGS.indexOf(a.opening) - OPENINGS.indexOf(b.opening);
  if (openingOrder !== 0) return openingOrder;
  return a.areaM2 - b.areaM2;
});

const outputDir = join(process.cwd(), 'scripts', 'output');
mkdirSync(outputDir, { recursive: true });

writeFileSync(join(outputDir, 'dealer-plisse-summary.json'), JSON.stringify(summaryRows, null, 2), 'utf8');
writeFileSync(join(outputDir, 'dealer-plisse-range-summary.json'), JSON.stringify(rangeRows, null, 2), 'utf8');
writeFileSync(join(outputDir, 'dealer-plisse-size-checks.json'), JSON.stringify(groupedSizeRows, null, 2), 'utf8');

const summaryMd = toMarkdownTable(
  [
    'Группа цвета',
    'Группа полотна',
    'Тип открывания',
    'Мин. цена за 1 м²',
    'Макс. цена за 1 м²',
    'Средняя цена за 1 м²',
    'Реком. цена за 1 м²',
    'Дилерская цена за 1 м² со скидкой 30%',
    'Разброс, %',
    'Рекомендация',
    'Комментарий',
  ],
  summaryRows.map((row) => [
    row.colorGroupLabel,
    row.meshGroupLabel,
    row.openingLabel,
    row.minRubPerM2.toFixed(2),
    row.maxRubPerM2.toFixed(2),
    row.avgRubPerM2.toFixed(2),
    row.recommendedRubPerM2.toFixed(2),
    String(row.dealerRubPerM2Discount30),
    row.spreadPct.toFixed(2),
    row.recommendation,
    row.comment,
  ])
);

const rangesMd = toMarkdownTable(
  [
    'Группа цвета',
    'Группа полотна',
    'Тип открывания',
    'Диапазон площади',
    'Мин. цена за 1 м²',
    'Макс. цена за 1 м²',
    'Средняя цена за 1 м²',
    'Реком. цена за 1 м²',
    'Кол-во проверок',
  ],
  rangeRows.map((row) => [
    row.colorGroupLabel,
    row.meshGroupLabel,
    row.openingLabel,
    row.areaRange,
    row.minRubPerM2.toFixed(2),
    row.maxRubPerM2.toFixed(2),
    row.avgRubPerM2.toFixed(2),
    row.recommendedRubPerM2.toFixed(2),
    String(row.samples),
  ])
);

const checksMd = toMarkdownTable(
  [
    'Группа цвета',
    'Группа полотна',
    'Тип открывания',
    'Ширина, мм',
    'Высота, мм',
    'Площадь, м²',
    'Расчетная цена изделия, ₽',
    'Расчетная цена за 1 м², ₽',
    'Дилерская цена изделия со скидкой 30%, ₽',
    'Дилерская цена за 1 м² со скидкой 30%, ₽',
  ],
  groupedSizeRows.map((row) => [
    row.colorGroupLabel,
    row.meshGroupLabel,
    row.openingLabel,
    String(row.width),
    String(row.height),
    row.areaM2.toFixed(4),
    row.totalRub.toFixed(2),
    row.rubPerM2.toFixed(2),
    String(row.dealerTotalRubDiscount30),
    String(row.dealerRubPerM2Discount30),
  ])
);

writeFileSync(join(outputDir, 'dealer-plisse-summary.md'), summaryMd, 'utf8');
writeFileSync(join(outputDir, 'dealer-plisse-range-summary.md'), rangesMd, 'utf8');
writeFileSync(join(outputDir, 'dealer-plisse-size-checks.md'), checksMd, 'utf8');

const needRanges = summaryRows.some((row) => row.recommendation === 'лучше использовать диапазоны');

console.log(
  JSON.stringify(
    {
      combinations: summaryRows.length,
      checks: groupedSizeRows.length,
      needRanges,
      ralExcluded: true,
      baseColorsUsed: BASE_COLORS,
      specialMeshesUsed: MESH_GROUPS.special.meshes,
      files: {
        summaryJson: join('scripts', 'output', 'dealer-plisse-summary.json'),
        rangeJson: join('scripts', 'output', 'dealer-plisse-range-summary.json'),
        checksJson: join('scripts', 'output', 'dealer-plisse-size-checks.json'),
        summaryMd: join('scripts', 'output', 'dealer-plisse-summary.md'),
        rangeMd: join('scripts', 'output', 'dealer-plisse-range-summary.md'),
        checksMd: join('scripts', 'output', 'dealer-plisse-size-checks.md'),
      },
    },
    null,
    2
  )
);
