import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));

function listJsFiles(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) listJsFiles(path, out);
    else if (name.endsWith('.js')) out.push(path);
  }
  return out;
}

function sourceBuildId() {
  const srcDir = join(root, 'src');
  const hash = createHash('sha256');
  for (const file of listJsFiles(srcDir)) {
    hash.update(relative(srcDir, file));
    hash.update(readFileSync(file));
  }
  return hash.digest('hex').slice(0, 16);
}

const buildId = sourceBuildId();
writeFileSync(join(root, '.build-id'), buildId);

await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  target: 'chrome108',
  outfile: 'dist/index.js',
  define: { __DRAKE_BUILD__: JSON.stringify(buildId) },
});

console.log('built dist/index.js');
