/**
 * Экспорт PRICES и матрицы полей в CSV/JSON для офлайн ПК-калькулятора.
 * Запуск: npm run export:desktop-prices
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PRICES } from '../constants';
import { ProductType } from '../types';

const OUT_DIR = join(process.cwd(), 'docs', 'prices-export');

type FlatRow = {
  price_group: string;
  path: string;
  value: number | string;
  unit_hint: string;
};

const UNIT_HINTS: Record<string, string> = {
  'classic_frames.profiles': 'rub_per_m',
  'classic_frames.corners': 'rub_per_pc',
  'classic_frames.meshes': 'rub_per_m2',
  'classic_frames.mounts.cord_5mm': 'rub_per_m',
  'classic_frames.mounts.z_plastic': 'rub_per_m',
  'classic_frames.mounts.z_metal': 'rub_per_m',
  'classic_frames.mounts.handle_frame_plastic': 'rub_per_pc',
  'classic_frames.mounts.handle_frame_metal': 'rub_per_pc',
  'classic_frames.mounts.handle_door_42mm': 'rub_per_pc',
  'classic_frames.mounts.pin_41mm': 'rub_per_pc',
  'classic_frames.hinges_42mm': 'rub_per_pc',
  'plisse_nets.profiles': 'rub_per_m',
  'plisse_nets.meshes': 'rub_per_unit_qtyMesh',
  'plisse_nets.components.insert_mesh_m': 'rub_per_m',
  'plisse_nets.components.insert_frame_m': 'rub_per_m',
  'plisse_nets.components.thread_m': 'rub_per_m',
  'plisse_nets.components.low_threshold_m': 'rub_per_m',
  'plisse_nets.components.magnetic_strip_m': 'rub_per_m',
  'plisse_blinds.fabrics_m2': 'rub_per_m2_fabric',
  'plisse_blinds.lite_system.profile_m': 'rub_per_m',
  'plisse_blinds.cozy_system.frame_m': 'rub_per_m',
  'plisse_blinds.cozy_system.sash_m': 'rub_per_m',
  'roll_nets.profiles': 'rub_per_m',
  'roll_nets.meshes': 'rub_per_m2',
  'window_works.labor_rates': 'rub_per_unit',
  'logistics': 'rub_fixed',
};

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Record<string, string | number>[], headers: string[]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

function inferUnit(path: string): string {
  for (const [prefix, unit] of Object.entries(UNIT_HINTS)) {
    if (path.startsWith(prefix)) return unit;
  }
  if (path.includes('markups') || path.includes('multiplier') || path.includes('labor')) {
    return path.includes('multiplier') ? 'multiplier' : 'rub_fixed';
  }
  if (path.includes('components') && path.endsWith('_pc')) return 'rub_per_pc';
  if (path.endsWith('_set')) return 'rub_per_set';
  return 'number';
}

function flattenPrices(obj: unknown, group: string, prefix = ''): FlatRow[] {
  const rows: FlatRow[] = [];
  if (obj === null || obj === undefined) return rows;

  if (typeof obj === 'number') {
    rows.push({ price_group: group, path: prefix, value: obj, unit_hint: inferUnit(prefix) });
    return rows;
  }

  if (typeof obj !== 'object') {
    rows.push({ price_group: group, path: prefix, value: String(obj), unit_hint: 'string' });
    return rows;
  }

  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key;
    rows.push(...flattenPrices(val, group, next));
  }
  return rows;
}

/** Таблица: строка = ключ прайса, колонки = цвета (если объект по цветам). */
function colorTableRows(
  group: string,
  section: string,
  table: Record<string, number | Record<string, number>>
): Record<string, string | number>[] {
  const out: Record<string, string | number>[] = [];
  for (const [itemKey, val] of Object.entries(table)) {
    if (typeof val === 'number') {
      out.push({
        price_group: group,
        section,
        item_key: itemKey,
        color: '_fixed',
        price_rub: val,
        unit_hint: inferUnit(`${group}.${section}.${itemKey}`),
      });
    } else {
      for (const [color, price] of Object.entries(val)) {
        out.push({
          price_group: group,
          section,
          item_key: itemKey,
          color,
          price_rub: price,
          unit_hint: inferUnit(`${group}.${section}`),
        });
      }
    }
  }
  return out;
}

const FIELD_MATRIX: {
  productType: ProductType;
  engine: string;
  requiredFields: string;
  optionalFields: string;
  ignoredFields: string;
  notes: string;
}[] = [
  {
    productType: ProductType.FRAME,
    engine: 'ClassicEngine',
    requiredFields: 'width;height;quantity;color;mesh;mount;cornerType;handleType;frameProfile',
    optionalFields: 'comment',
    ignoredFields: '',
    notes: 'frameProfile=32: уголки только plastic_32mm в расчёте',
  },
  {
    productType: ProductType.WING,
    engine: 'ClassicEngine',
    requiredFields: 'width;height;quantity;color;mesh',
    optionalFields: 'mount;cornerType;handleType;comment',
    ignoredFields: '',
    notes: 'UI без крепления/углов/ручек; дефолты state в расчёте',
  },
  {
    productType: ProductType.INSIDE_INSERT,
    engine: 'ClassicEngine',
    requiredFields: 'width;height;quantity;color;mesh',
    optionalFields: 'mount;cornerType;handleType',
    ignoredFields: '',
    notes: 'Без импоста',
  },
  {
    productType: ProductType.DOOR,
    engine: 'ClassicEngine',
    requiredFields: 'width;height;quantity;color;mesh;doorProfile;hingesCount;hasLatch;hasBolt',
    optionalFields: 'mount',
    ignoredFields: 'cornerType;handleType;frameProfile',
    notes: 'install 1000; mult 2.8',
  },
  {
    productType: ProductType.ROLL,
    engine: 'RollEngine',
    requiredFields: 'width;height;quantity;mesh',
    optionalFields: 'color',
    ignoredFields: 'mount;cornerType;handleType;opening;threshold;handles',
    notes: 'color не влияет на расчёт',
  },
  {
    productType: ProductType.PLISSE_NET,
    engine: 'PlisseNetEngine',
    requiredFields: 'width;height;quantity;color;mesh;opening;threshold;handles',
    optionalFields: '',
    ignoredFields: 'mount;cornerType;handleType;frameProfile',
    notes: 'mesh: standard|antikoshka|antipyl',
  },
  {
    productType: ProductType.JALOUSIE_CLASSIC,
    engine: 'BlindsEngine',
    requiredFields: 'width;height;quantity;color;mesh;opening;threshold;handles',
    optionalFields: '',
    ignoredFields: 'mount;cornerType;handleType',
    notes: 'Ткань FB/FA',
  },
  {
    productType: ProductType.JALOUSIE_LIGHT,
    engine: 'BlindsEngine',
    requiredFields: 'width;height;quantity;color;mesh',
    optionalFields: '',
    ignoredFields: 'opening;threshold;handles;mount',
    notes: 'lite_system',
  },
  {
    productType: ProductType.JALOUSIE_COZY,
    engine: 'BlindsEngine',
    requiredFields: 'width;height;quantity;color;mesh;opening',
    optionalFields: '',
    ignoredFields: 'threshold;handles',
    notes: 'opening: side|up',
  },
  {
    productType: ProductType.SEAL,
    engine: 'MaintenanceEngine',
    requiredFields: 'quantity',
    optionalFields: '',
    ignoredFields: 'width;height;color;mesh',
    notes: 'quantity = м.п.',
  },
  {
    productType: ProductType.COMB,
    engine: 'MaintenanceEngine',
    requiredFields: 'quantity;handleType',
    optionalFields: '',
    ignoredFields: 'width;height',
    notes: '',
  },
  {
    productType: ProductType.CHILD_LOCK,
    engine: 'MaintenanceEngine',
    requiredFields: 'quantity',
    optionalFields: '',
    ignoredFields: '',
    notes: '',
  },
  {
    productType: ProductType.ADJUSTMENT,
    engine: 'MaintenanceEngine',
    requiredFields: 'quantity;subType',
    optionalFields: '',
    ignoredFields: '',
    notes: 'subType window|door',
  },
];

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const exportedAt = new Date().toISOString();

  const flat: FlatRow[] = [];
  const ps = PRICES.price_settings;
  for (const [group, data] of Object.entries(ps)) {
    flat.push(...flattenPrices(data, group));
  }

  writeFileSync(
    join(OUT_DIR, 'prices-flat.csv'),
    rowsToCsv(
      flat.map((r) => ({
        price_group: r.price_group,
        path: r.path,
        value: r.value,
        unit_hint: r.unit_hint,
      })),
      ['price_group', 'path', 'value', 'unit_hint']
    ),
    'utf8'
  );

  const structured: Record<string, string | number>[] = [];
  const CF = ps.classic_frames;
  structured.push(...colorTableRows('classic_frames', 'profiles', CF.profiles as Record<string, Record<string, number>>));
  structured.push(...colorTableRows('classic_frames', 'corners', CF.corners as Record<string, Record<string, number> | number>));
  structured.push(...colorTableRows('classic_frames', 'meshes', CF.meshes));
  structured.push(...colorTableRows('classic_frames', 'mounts', CF.mounts as Record<string, Record<string, number> | number>));

  const PN = ps.plisse_nets;
  structured.push(...colorTableRows('plisse_nets', 'profiles', PN.profiles));
  structured.push(...colorTableRows('plisse_nets', 'meshes', PN.meshes));
  structured.push(...colorTableRows('plisse_nets', 'components', PN.components as Record<string, number>));
  structured.push(
    ...Object.entries(PN.markups).map(([k, v]) => ({
      price_group: 'plisse_nets',
      section: 'markups',
      item_key: k,
      color: '_fixed',
      price_rub: v,
      unit_hint: k.includes('multiplier') ? 'multiplier' : k.includes('rate') ? 'rub_per_m2' : 'number',
    }))
  );

  const PB = ps.plisse_blinds;
  structured.push(...colorTableRows('plisse_blinds', 'fabrics_m2', PB.fabrics_m2));
  structured.push(...colorTableRows('plisse_blinds', 'lite_system', PB.lite_system as Record<string, number>));
  structured.push(...colorTableRows('plisse_blinds', 'cozy_system', PB.cozy_system as Record<string, Record<string, number> | number>));
  structured.push(
    ...Object.entries(PB.markups).map(([k, v]) => ({
      price_group: 'plisse_blinds',
      section: 'markups',
      item_key: k,
      color: '_fixed',
      price_rub: v,
      unit_hint: 'number',
    }))
  );

  const RN = ps.roll_nets;
  structured.push(...colorTableRows('roll_nets', 'profiles', RN.profiles));
  structured.push(...colorTableRows('roll_nets', 'meshes', RN.meshes));
  structured.push(...colorTableRows('roll_nets', 'components', RN.components as Record<string, number>));
  structured.push(
    ...Object.entries(RN.markups).map(([k, v]) => ({
      price_group: 'roll_nets',
      section: 'markups',
      item_key: k,
      color: '_fixed',
      price_rub: v,
      unit_hint: k.includes('multiplier') ? 'multiplier' : 'rub_fixed',
    }))
  );

  structured.push(...colorTableRows('window_works', 'labor_rates', ps.window_works.labor_rates));
  structured.push(...colorTableRows('logistics', 'rates', ps.logistics));

  writeFileSync(
    join(OUT_DIR, 'prices-structured.csv'),
    rowsToCsv(structured, ['price_group', 'section', 'item_key', 'color', 'price_rub', 'unit_hint']),
    'utf8'
  );

  writeFileSync(
    join(OUT_DIR, 'product-fields-matrix.csv'),
    rowsToCsv(
      FIELD_MATRIX.map((r) => ({
        product_type: r.productType,
        engine: r.engine,
        required_fields: r.requiredFields,
        optional_fields: r.optionalFields,
        ignored_fields: r.ignoredFields,
        notes: r.notes,
      })),
      ['product_type', 'engine', 'required_fields', 'optional_fields', 'ignored_fields', 'notes']
    ),
    'utf8'
  );

  writeFileSync(
    join(OUT_DIR, 'prices-full.json'),
    JSON.stringify({ exportedAt, source: 'constants.ts PRICES', price_settings: ps }, null, 2),
    'utf8'
  );

  writeFileSync(
    join(OUT_DIR, 'product-fields-matrix.json'),
    JSON.stringify({ exportedAt, entries: FIELD_MATRIX }, null, 2),
    'utf8'
  );

  writeFileSync(
    join(OUT_DIR, 'README.txt'),
    [
      'Экспорт прайса для офлайн ПК-калькулятора',
      `Сгенерировано: ${exportedAt}`,
      'Команда: npm run export:desktop-prices',
      '',
      'prices-flat.csv       — все числовые листья PRICES (path + value)',
      'prices-structured.csv — профили/полотна/монтаж по цветам',
      'prices-full.json      — полный price_settings (для импорта в ПК)',
      'product-fields-matrix.csv / .json — какие поля для какого ProductType',
      '',
      'После изменения constants.ts перезапустите экспорт.',
    ].join('\n'),
    'utf8'
  );

  console.log(`Exported to ${OUT_DIR}`);
  console.log(`  prices-flat.csv (${flat.length} rows)`);
  console.log(`  prices-structured.csv (${structured.length} rows)`);
  console.log(`  prices-full.json`);
  console.log(`  product-fields-matrix.csv (${FIELD_MATRIX.length} products)`);
}

main();
