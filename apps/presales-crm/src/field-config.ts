import type { ProductFieldsMatrix, ProductMatrixEntry, UiMatrixEntry } from './types';

export interface FieldVisibility {
  required: Set<string>;
  optional: Set<string>;
  ignored: Set<string>;
}

export function parseMatrixEntry(entry: ProductMatrixEntry): FieldVisibility {
  const split = (s: string) => new Set(s.split(';').map((x) => x.trim()).filter(Boolean));
  return {
    required: split(entry.requiredFields),
    optional: split(entry.optionalFields),
    ignored: split(entry.ignoredFields),
  };
}

export function isFieldVisible(name: string, vis: FieldVisibility): boolean {
  if (vis.ignored.has(name)) return false;
  return vis.required.has(name) || vis.optional.has(name);
}

export function getMatrixEntry(matrix: ProductFieldsMatrix, productType: string): ProductMatrixEntry | undefined {
  return matrix.entries.find((e) => e.productType === productType);
}
