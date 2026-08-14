/**
 * Hash a source tree for Task 13 import integrity checks.
 * Usage:
 *   node scripts/hash-source-tree.mjs <sourceDir> <outJson> [--importable-only]
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXCLUDE_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.gradle',
  '.idea',
  '.vscode',
  '.tmp-analysis',
  '.tmp-analysis-cjs',
  'output',
  '__pycache__',
]);

const EXCLUDE_FILE_GLOBS = [
  /^\.env(\..+)?$/i,
  /\.jks$/i,
  /\.keystore$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.apk$/i,
  /\.aab$/i,
  /service-account/i,
  /serviceAccount/i,
];

function shouldSkipDir(name) {
  if (EXCLUDE_DIR_NAMES.has(name)) return true;
  if (name.startsWith('.tmp-analysis')) return true;
  return false;
}

function shouldSkipFile(name) {
  return EXCLUDE_FILE_GLOBS.some((re) => re.test(name));
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function walk(dir, root, files) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      // Skip android build/gradle caches even if nested under android/
      if (entry.name === 'build' || entry.name === '.gradle') continue;
      await walk(full, root, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (shouldSkipFile(entry.name)) continue;
    const rel = path.relative(root, full).split(path.sep).join('/');
    files.push(rel);
  }
}

async function main() {
  const sourceDir = path.resolve(process.argv[2] ?? '');
  const outJson = path.resolve(process.argv[3] ?? '');
  if (!sourceDir || !outJson) {
    console.error('Usage: node scripts/hash-source-tree.mjs <sourceDir> <outJson>');
    process.exit(1);
  }

  const files = [];
  await walk(sourceDir, sourceDir, files);
  files.sort((a, b) => a.localeCompare(b));

  const entries = [];
  for (const rel of files) {
    const full = path.join(sourceDir, rel);
    const st = await stat(full);
    const sha256 = await hashFile(full);
    entries.push({ path: rel, size: st.size, sha256 });
  }

  const payload = {
    sourceDir,
    generatedAt: new Date().toISOString(),
    fileCount: entries.length,
    entries,
  };

  await mkdir(path.dirname(outJson), { recursive: true });
  await writeFile(outJson, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`HASH_MANIFEST_OK files=${entries.length} out=${outJson}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
