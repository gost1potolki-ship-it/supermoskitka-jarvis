import { ProductType, type CartItem } from '@calc/types';
import {
  label,
  COLOR_LABELS,
  MESH_LABELS,
  OPENING_LABELS,
  THRESHOLD_LABELS,
  MOUNT_LABELS,
  CORNER_LABELS,
  HANDLE_LABELS,
} from './labels';

const MESH_EXPORT_HINTS: Partial<Record<string, string>> = {
  standard: 'Fiberglass, ячейка 1,2 мм',
};

function exportMeshLabel(mesh: string | undefined): string {
  if (!mesh) return '—';
  const base = label(mesh, MESH_LABELS);
  const hint = MESH_EXPORT_HINTS[mesh];
  return hint ? `${base} (${hint})` : base;
}

function exportMountLabel(mount: string | undefined): string {
  if (!mount) return '—';
  if (mount === 'standard') return 'Z-пластик';
  return label(mount, MOUNT_LABELS);
}

function getExportTypeName(item: CartItem): string {
  switch (item.type) {
    case ProductType.FRAME:
      return 'Рамочная москитная сетка';
    case ProductType.WING:
      return 'Москитная сетка «Крыло»';
    case ProductType.INSIDE_INSERT:
      return 'Внутрисветовая москитная сетка VSN';
    case ProductType.DOOR:
      return item.doorProfile
        ? `Дверная распашная москитная сетка (${item.doorProfile} мм)`
        : 'Дверная распашная москитная сетка';
    case ProductType.PLISSE_NET:
      return 'Москитная сетка плиссе';
    case ProductType.ROLL:
      return 'Рулонная москитная сетка';
    case ProductType.JALOUSIE_CLASSIC:
      return 'Штора плиссе ПОРТАЛ';
    case ProductType.JALOUSIE_LIGHT:
      return 'Штора плиссе ЛАЙТ';
    case ProductType.JALOUSIE_COZY:
      return 'Штора плиссе Уют';
    case ProductType.SEAL:
      return 'Замена уплотнителя';
    case ProductType.COMB:
      return 'Гребенка';
    case ProductType.CHILD_LOCK:
      return 'Детский замок';
    case ProductType.ADJUSTMENT:
      return 'Регулировка фурнитуры';
    default:
      return String(item.type);
  }
}

/** Блок одной позиции для экспорта корзины / КП */
export function formatCartExportItemBlock(item: CartItem, displayIndex: number): string {
  const lines: string[] = [];
  const qty = item.quantity ?? 1;

  lines.push(`Позиция ${displayIndex}:`);
  lines.push(`Вид: ${getExportTypeName(item)}`);
  lines.push(`Кол-во: ${qty} шт.`);

  if (
    item.mesh &&
    (item.type === ProductType.FRAME ||
      item.type === ProductType.WING ||
      item.type === ProductType.DOOR ||
      item.type === ProductType.INSIDE_INSERT ||
      item.type === ProductType.PLISSE_NET ||
      item.type === ProductType.ROLL)
  ) {
    lines.push(`Полотно: ${exportMeshLabel(item.mesh)}`);
  }
  if (
    item.type === ProductType.JALOUSIE_CLASSIC ||
    item.type === ProductType.JALOUSIE_LIGHT ||
    item.type === ProductType.JALOUSIE_COZY
  ) {
    lines.push(`Ткань: ${exportMeshLabel(item.mesh)}`);
  }

  if (item.color != null) {
    lines.push(`Цвет профиля: ${label(item.color, COLOR_LABELS)}`);
  }

  if (item.type === ProductType.FRAME && item.frameProfile) {
    lines.push(`Профиль: ${item.frameProfile} мм`);
  }
  if (item.type === ProductType.WING) {
    lines.push('Профиль: крыло');
  }
  if (item.type === ProductType.INSIDE_INSERT) {
    lines.push('Профиль: VSN');
  }
  if (item.type === ProductType.DOOR && item.doorProfile) {
    lines.push(`Профиль: ${item.doorProfile} мм`);
  }

  if (item.width != null && item.height != null) {
    lines.push(`Размер: ${item.width} × ${item.height} мм`);
  }

  if (
    item.mount != null &&
    (item.type === ProductType.FRAME ||
      item.type === ProductType.WING ||
      item.type === ProductType.INSIDE_INSERT)
  ) {
    lines.push(`Крепеж: ${exportMountLabel(item.mount)}`);
  }

  if (item.type === ProductType.FRAME || item.type === ProductType.WING) {
    lines.push(`Уголки: ${label(item.cornerType ?? 'plastic', CORNER_LABELS)}`);
    if (item.handleType === 'metal') {
      lines.push(`Ручки: ${label(item.handleType, HANDLE_LABELS)}`);
    }
  }

  if (item.type === ProductType.DOOR) {
    if (item.hingesCount != null && item.hingesCount > 0) {
      lines.push(`Петли: ${item.hingesCount} шт.`);
    }
    if (item.hasLatch) {
      lines.push('Защелка: да');
    }
    if (item.hasBolt) {
      lines.push('Шпингалет: да');
    }
  }

  if (
    item.type === ProductType.PLISSE_NET ||
    item.type === ProductType.JALOUSIE_CLASSIC ||
    item.type === ProductType.JALOUSIE_COZY
  ) {
    if (item.opening) {
      lines.push(`Открывание: ${label(item.opening, OPENING_LABELS)}`);
    }
  }

  if (item.type === ProductType.PLISSE_NET) {
    const thresholdText = item.threshold ? label(item.threshold, THRESHOLD_LABELS) : 'Стандарт';
    lines.push(`Порог: ${thresholdText}`);
    if (item.handles != null && item.handles > 0) {
      lines.push(`Ручки: ${item.handles} шт.`);
    } else {
      lines.push('Ручки: —');
    }
  }

  if (item.comment) {
    lines.push(`Заметка: ${item.comment}`);
  }

  return lines.join('\n');
}

export function formatCartExportItems(items: CartItem[]): string[] {
  const lines: string[] = [];
  items.forEach((item, i) => {
    if (i > 0) lines.push('');
    lines.push(formatCartExportItemBlock(item, i + 1));
  });
  return lines;
}
