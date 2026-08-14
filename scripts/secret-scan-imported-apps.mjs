/**
 * Read-only secret scan for imported apps. Reports categories + paths only.
 * Does not print secret values.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = [
  path.join(root, 'apps/presales-crm'),
  path.join(root, 'apps/measurer'),
  path.join(root, 'integrations'),
];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.gradle', '__pycache__']);

const findings = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(full);
      continue;
    }
    if (!st.isFile()) continue;
    const rel = path.relative(root, full).split(path.sep).join('/');
    const base = name.toLowerCase();

    if (base === '.env.local' || /^\.env\..+\.local$/i.test(base)) {
      findings.push({ category: 'gitignored_env_local_present', path: rel });
      continue;
    }
    if (/^\.env(\..+)?$/i.test(base) && base !== '.env.example') {
      findings.push({ category: 'env_file', path: rel });
    }
    if (/service-account|serviceaccount/i.test(base) && base.endsWith('.json')) {
      findings.push({ category: 'service_account_json', path: rel });
    }
    if (/\.(pem|key|p12|jks|keystore)$/i.test(base)) {
      findings.push({ category: 'private_key_material', path: rel });
    }

    if (!/\.(ts|tsx|js|jsx|gs|json|md|env|txt|yml|yaml)$/i.test(base)) continue;
    if (base === '.env.example') continue;

    let text = '';
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      continue;
    }

    if (/BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/.test(text)) {
      findings.push({ category: 'private_key_pem_content', path: rel });
    }
    if (/script\.google\.com\/macros\/s\//i.test(text)) {
      findings.push({ category: 'google_apps_script_url_literal', path: rel });
    }
    if (/Authorization:\s*Bearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(text)) {
      findings.push({ category: 'bearer_literal', path: rel });
    }
    if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text)) {
      findings.push({ category: 'jwt_like_literal', path: rel });
    }
    if (/VALID_PASSWORD\s*=\s*['"][^'"]+['"]/.test(text)) {
      findings.push({ category: 'literal_password_assignment', path: rel });
    }
    if (/password\s*[:=]\s*['"][^'"]{6,}['"]/i.test(text) && !rel.includes('.env.example')) {
      findings.push({ category: 'password_assignment_literal', path: rel });
    }
  }
}

for (const r of roots) walk(r);

function isPreexistingMeasurerGasLiteral(f) {
  return (
    f.category === 'google_apps_script_url_literal' &&
    f.path.startsWith('apps/measurer/')
  );
}

const blockers = findings.filter((f) => {
  if (f.category === 'gitignored_env_local_present') return false;
  if (isPreexistingMeasurerGasLiteral(f)) return false;
  return [
    'service_account_json',
    'private_key_material',
    'private_key_pem_content',
    'google_apps_script_url_literal',
    'bearer_literal',
    'jwt_like_literal',
    'literal_password_assignment',
    'password_assignment_literal',
    'env_file',
  ].includes(f.category);
});

for (const f of findings) {
  const tag = isPreexistingMeasurerGasLiteral(f) ? 'preexisting_measurer_source' : f.category;
  console.log(`${tag}\t${f.path}`);
}

if (blockers.length) {
  console.error(`SECRET_SCAN_BLOCKED count=${blockers.length}`);
  process.exit(1);
}

console.log('SECRET_SCAN_PASS');
