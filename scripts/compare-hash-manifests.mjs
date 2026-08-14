/**
 * Compare a hash manifest to an actual directory (Task 13 measurer integrity).
 * Usage:
 *   node scripts/compare-hash-manifests.mjs <expectedJson> <actualRoot>
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function main() {
  const expectedPath = path.resolve(process.argv[2] ?? '');
  const actualRoot = path.resolve(process.argv[3] ?? '');
  if (!expectedPath || !actualRoot) {
    console.error('Usage: node scripts/compare-hash-manifests.mjs <expectedJson> <actualRoot>');
    process.exit(1);
  }

  const expected = JSON.parse(await readFile(expectedPath, 'utf8'));
  const mismatches = [];
  const missing = [];

  for (const entry of expected.entries) {
    const full = path.join(actualRoot, entry.path);
    if (!existsSync(full)) {
      missing.push(entry.path);
      continue;
    }
    const st = await stat(full);
    const sha256 = await hashFile(full);
    if (st.size !== entry.size || sha256 !== entry.sha256) {
      mismatches.push(entry.path);
    }
  }

  if (missing.length || mismatches.length) {
    console.error(`COMPARE_FAIL missing=${missing.length} mismatched=${mismatches.length}`);
    for (const p of missing.slice(0, 30)) console.error(`MISSING ${p}`);
    for (const p of mismatches.slice(0, 30)) console.error(`MISMATCH ${p}`);
    process.exit(1);
  }

  console.log(`COMPARE_OK files=${expected.entries.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
