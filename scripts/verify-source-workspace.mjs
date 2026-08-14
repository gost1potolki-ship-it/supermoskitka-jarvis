/**
 * Verify Task 13 consolidated workspace layout (no network).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`VERIFY_FAIL: ${message}`);
  process.exit(1);
}

function mustExist(rel) {
  const full = path.join(root, rel);
  if (!existsSync(full)) fail(`missing ${rel}`);
}

mustExist('apps/presales-crm/package.json');
mustExist('apps/measurer/package.json');
mustExist('apps/measurer/logic/calculations.ts');
mustExist('apps/measurer/logic/orderTotals.ts');
mustExist('apps/presales-crm/src/main.ts');

if (existsSync(path.join(root, 'apps/presales-crm/.git'))) {
  fail('nested .git under apps/presales-crm');
}
if (existsSync(path.join(root, 'apps/measurer/.git'))) {
  fail('nested .git under apps/measurer');
}

const viteConfig = readFileSync(path.join(root, 'apps/presales-crm/vite.config.ts'), 'utf8');
if (!viteConfig.includes("../measurer") && !viteConfig.includes('..\\measurer')) {
  fail('CRM vite.config.ts does not alias @calc to ../measurer');
}
if (viteConfig.includes('../calc_v2') || viteConfig.includes('D:\\\\calc_v2') || viteConfig.includes('D:/calc_v2')) {
  fail('CRM vite.config.ts still references external calc_v2');
}

const tsconfig = readFileSync(path.join(root, 'apps/presales-crm/tsconfig.json'), 'utf8');
if (!tsconfig.includes('../measurer')) {
  fail('CRM tsconfig.json does not point @calc paths to ../measurer');
}
if (tsconfig.includes('../calc_v2')) {
  fail('CRM tsconfig.json still references ../calc_v2');
}

const aliasTarget = path.resolve(root, 'apps/presales-crm', '../measurer');
if (!existsSync(aliasTarget)) fail(`resolved @calc target missing: ${aliasTarget}`);
if (!existsSync(path.join(aliasTarget, 'logic', 'calculations.ts'))) {
  fail('resolved @calc target missing logic/calculations.ts');
}

if (existsSync(path.join(root, 'apps/measurer/scripts/__pycache__'))) {
  const names = readdirSync(path.join(root, 'apps/measurer/scripts/__pycache__'));
  if (names.some((n) => n.endsWith('.pyc'))) {
    fail('imported measurer contains __pycache__ bytecode');
  }
}

console.log('VERIFY_WORKSPACE_OK');
