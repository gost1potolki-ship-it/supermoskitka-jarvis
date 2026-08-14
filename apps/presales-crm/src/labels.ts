export {
  COLOR_LABELS,
  MESH_LABELS,
  OPENING_LABELS,
  THRESHOLD_LABELS,
  MOUNT_LABELS,
  CORNER_LABELS,
  HANDLE_LABELS,
} from '@calc/constants';

export function label(value: string | undefined, labels: Record<string, string>): string {
  if (!value) return '—';
  return labels[value] ?? value;
}
