/**
 * Pure helpers for OdiRouter model catalog filtering/printing.
 * Network I/O stays in scripts/list-odirouter-models.ts.
 */

export interface OdiRouterCatalogModel {
  id: string;
  name?: string;
  provider?: string;
  category?: string;
  features?: string[];
  context_length?: number;
  max_output_tokens?: number;
  input_modalities?: string[];
  output_modalities?: string[];
  pricing?: unknown;
  free?: boolean;
}

export interface OdiRouterModelShortlistItem {
  id: string;
  name: string;
  provider: string;
  features: string[];
  context_length: number | null;
  max_output_tokens: number | null;
  toolCalling: boolean;
  free: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length > 0 ? items : undefined;
}

export function parseOdiRouterCatalogPayload(payload: unknown): OdiRouterCatalogModel[] {
  const root = asRecord(payload);
  const data = root?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  const models: OdiRouterCatalogModel[] = [];
  for (const item of data) {
    const row = asRecord(item);
    if (!row) {
      continue;
    }
    const id = asString(row.id);
    if (!id) {
      continue;
    }

    const architecture = asRecord(row.architecture);
    models.push({
      id,
      name: asString(row.name),
      provider: asString(row.provider) ?? asString(row.owned_by),
      category: asString(row.category),
      features: asStringArray(row.features) ?? asStringArray(row.supported_parameters),
      context_length: asNumber(row.context_length) ?? asNumber(row.contextLength),
      max_output_tokens: asNumber(row.max_output_tokens) ?? asNumber(row.maxOutputTokens),
      input_modalities:
        asStringArray(row.input_modalities) ?? asStringArray(architecture?.input_modalities),
      output_modalities:
        asStringArray(row.output_modalities) ?? asStringArray(architecture?.output_modalities),
      pricing: row.pricing,
      free: row.free === true,
    });
  }
  return models;
}

function hasTextModality(modalities: string[] | undefined): boolean {
  if (modalities === undefined) {
    // Catalog entries without modality metadata are treated as text-capable LLM candidates.
    return true;
  }
  return modalities.map((item) => item.toLowerCase()).includes('text');
}

export function filterTextLlmCatalogModels(
  models: OdiRouterCatalogModel[],
): OdiRouterCatalogModel[] {
  return models.filter((model) => {
    if (model.category !== undefined && model.category.toLowerCase() !== 'llm') {
      return false;
    }
    return hasTextModality(model.input_modalities) && hasTextModality(model.output_modalities);
  });
}

function isExplicitlyFree(model: OdiRouterCatalogModel): boolean {
  if (model.free === true) {
    return true;
  }
  const pricing = asRecord(model.pricing);
  if (!pricing) {
    return false;
  }
  if (pricing.free === true) {
    return true;
  }
  const prompt = asString(pricing.prompt) ?? asString(pricing.input);
  const completion = asString(pricing.completion) ?? asString(pricing.output);
  return prompt === '0' && completion === '0';
}

export function toOdiRouterModelShortlist(
  models: OdiRouterCatalogModel[],
): OdiRouterModelShortlistItem[] {
  return models.map((model) => {
    const features = model.features ?? [];
    return {
      id: model.id,
      name: model.name ?? model.id,
      provider: model.provider ?? 'unknown',
      features,
      context_length: model.context_length ?? null,
      max_output_tokens: model.max_output_tokens ?? null,
      toolCalling: features.map((item) => item.toLowerCase()).includes('tool_calling'),
      free: isExplicitlyFree(model),
    };
  });
}
