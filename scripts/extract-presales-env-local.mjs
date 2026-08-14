/**
 * One-shot helper: copy compatibility secrets from SOURCE CRM into gitignored .env.local.
 * Does not print secret values.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const sourceRoot = process.argv[2];
const targetEnvLocal = process.argv[3];
if (!sourceRoot || !targetEnvLocal) {
  console.error('Usage: node scripts/extract-presales-env-local.mjs <sourceCrmRoot> <targetEnvLocal>');
  process.exit(1);
}

const authPath = path.join(sourceRoot, 'src', 'auth.ts');
const webhookPath = path.join(sourceRoot, 'src', 'lib', 'sheet-webhook.ts');
const auth = readFileSync(authPath, 'utf8');
const webhook = readFileSync(webhookPath, 'utf8');

const login = auth.match(/const VALID_LOGIN = '([^']*)'/)?.[1];
const password = auth.match(/const VALID_PASSWORD = '([^']*)'/)?.[1];
const webhookUrl = webhook.match(/export const GOOGLE_SHEET_WEBHOOK_URL =\s*'([^']*)'/)?.[1];

if (!login || !password || !webhookUrl) {
  console.error('EXTRACT_FAIL: could not parse required compatibility values from source');
  process.exit(1);
}

const body = [
  `VITE_PRESALES_LOGIN=${login}`,
  `VITE_PRESALES_PASSWORD=${password}`,
  `VITE_GOOGLE_SHEET_WEBHOOK_URL=${webhookUrl}`,
  '',
].join('\n');

if (existsSync(targetEnvLocal)) {
  console.error('EXTRACT_FAIL: target .env.local already exists');
  process.exit(1);
}

writeFileSync(targetEnvLocal, body, 'utf8');
console.log('EXTRACT_OK env.local written (values not logged)');
