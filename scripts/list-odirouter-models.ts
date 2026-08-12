/**
 * Lists OdiRouter text LLM catalog entries available to the configured API key.
 * Not part of `npm test`. Requires ODIROUTER_API_KEY.
 */
import { config as loadEnv } from 'dotenv';

import {
  DEFAULT_ODIROUTER_BASE_URL,
  filterTextLlmCatalogModels,
  parseOdiRouterCatalogPayload,
  toOdiRouterModelShortlist,
} from '../src/llm/index.js';

loadEnv();

async function main(): Promise<void> {
  const apiKey = process.env.ODIROUTER_API_KEY?.trim() ?? '';
  const baseUrl = (process.env.ODIROUTER_BASE_URL?.trim() || DEFAULT_ODIROUTER_BASE_URL).replace(
    /\/$/,
    '',
  );

  if (apiKey === '') {
    console.error('Missing required environment variable: ODIROUTER_API_KEY');
    console.error('Set ODIROUTER_API_KEY in .env, then re-run: npm run models:odirouter');
    process.exitCode = 1;
    return;
  }

  const url = new URL(`${baseUrl}/models/catalog`);
  url.searchParams.set('page_size', '100');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    console.error('Failed to fetch OdiRouter model catalog');
    console.error(`status: ${response.status}`);
    process.exitCode = 1;
    return;
  }

  const payload: unknown = await response.json();
  const shortlist = toOdiRouterModelShortlist(
    filterTextLlmCatalogModels(parseOdiRouterCatalogPayload(payload)),
  );

  console.log(`provider: odirouter`);
  console.log(`baseUrl: ${baseUrl}`);
  console.log(`text_llm_count: ${shortlist.length}`);
  console.log('');

  for (const model of shortlist) {
    const marks: string[] = [];
    if (model.toolCalling) {
      marks.push('TOOL_CALLING');
    }
    if (model.free) {
      marks.push('FREE');
    }
    const markText = marks.length > 0 ? ` [${marks.join(', ')}]` : '';
    console.log(`id: ${model.id}${markText}`);
    console.log(`  name: ${model.name}`);
    console.log(`  provider: ${model.provider}`);
    console.log(`  features: ${model.features.join(', ') || '(none)'}`);
    console.log(`  context_length: ${model.context_length ?? 'n/a'}`);
    console.log(`  max_output_tokens: ${model.max_output_tokens ?? 'n/a'}`);
    console.log('');
  }

  console.log('Pick an exact catalog id and set ODIROUTER_MODEL in .env');
  console.log('Do not invent model slugs by marketing name.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown catalog failure';
  console.error('Failed to list OdiRouter models:', message);
  process.exitCode = 1;
});
