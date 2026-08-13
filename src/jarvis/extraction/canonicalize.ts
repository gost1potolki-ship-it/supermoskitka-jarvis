/** Lightweight phone normalization — digits to +7… when possible. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  return raw.trim();
}

const PRODUCT_TYPES = new Set(['FRAME', 'WING', 'DOOR', 'PLISSE_NET']);
const MESH_TYPES = new Set(['STANDARD', 'ANTIMOSHKA', 'ANTICAT', 'ANTIDUST']);
const PROFILE_COLORS = new Set(['WHITE', 'BROWN_8017', 'GRAY_7016', 'CUSTOM_RAL']);
const COLOR_FINISHES = new Set(['муар', 'глянец', 'матовый', 'стандарт', 'STANDARD', 'MATTE', 'GLOSS', 'MUAR']);

export function canonicalizeProductType(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const upper = value.trim().toUpperCase();
  return PRODUCT_TYPES.has(upper) ? upper : null;
}

export function canonicalizeMeshType(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const raw = value.trim().toUpperCase().replace(/\s+/g, '_');
  const aliases: Record<string, string> = {
    ANTIMOSHKA: 'ANTIMOSHKA',
    'ANTI-MOSHKA': 'ANTIMOSHKA',
    АНТИМОШКА: 'ANTIMOSHKA',
    STANDARD: 'STANDARD',
    ОБЫЧНАЯ: 'STANDARD',
    ANTICAT: 'ANTICAT',
    АНТИКОШКА: 'ANTICAT',
    ANTIDUST: 'ANTIDUST',
    АНТИПЫЛЬ: 'ANTIDUST',
  };
  const mapped = aliases[raw] ?? aliases[value.trim().toUpperCase()];
  if (mapped && MESH_TYPES.has(mapped)) {
    return mapped;
  }
  return MESH_TYPES.has(raw) ? raw : null;
}

export function canonicalizeProfileColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase().replace(/\s+/g, '_');
  const aliases: Record<string, string> = {
    WHITE: 'WHITE',
    БЕЛЫЙ: 'WHITE',
    БЕЛАЯ: 'WHITE',
    БЕЛОЕ: 'WHITE',
    BROWN: 'BROWN_8017',
    BROWN_8017: 'BROWN_8017',
    '8017': 'BROWN_8017',
    КОРИЧНЕВЫЙ: 'BROWN_8017',
    КОРИЧНЕВАЯ: 'BROWN_8017',
    GRAY: 'GRAY_7016',
    GREY: 'GRAY_7016',
    GRAY_7016: 'GRAY_7016',
    '7016': 'GRAY_7016',
    RAL_7016: 'GRAY_7016',
    СЕРЫЙ: 'GRAY_7016',
    СЕРАЯ: 'GRAY_7016',
    АНТРАЦИТ: 'GRAY_7016',
    CUSTOM_RAL: 'CUSTOM_RAL',
  };
  const mapped = aliases[upper] ?? aliases[trimmed.toUpperCase()];
  if (mapped && PROFILE_COLORS.has(mapped)) {
    return mapped;
  }
  return PROFILE_COLORS.has(upper) ? upper : null;
}

export function canonicalizeColorFinish(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/ё/g, 'е');
  const aliases: Record<string, string> = {
    муар: 'муар',
    muar: 'муар',
    глянец: 'глянец',
    gloss: 'глянец',
    глянцевый: 'глянец',
    матовый: 'матовый',
    matte: 'матовый',
    стандарт: 'стандарт',
    standard: 'стандарт',
  };
  const mapped = aliases[normalized];
  if (mapped) {
    return mapped;
  }
  return COLOR_FINISHES.has(value.trim()) ? value.trim() : null;
}

export function canonicalizeRal(value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return String(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length >= 3 && digits.length <= 5) {
    return digits;
  }
  return null;
}
