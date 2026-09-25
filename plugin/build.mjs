import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { SOURCE_EXTENSIONS, esbuildOptions, overlayOptions } from './buildConfig.mjs';

const root = dirname(fileURLToPath(import.meta.url));

function listSourceFiles(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) listSourceFiles(path, out);
    else if (SOURCE_EXTENSIONS.includes(extname(name))) out.push(path);
  }
  return out;
}

function sourceBuildId() {
  const srcDir = join(root, 'src');
  const hash = createHash('sha256');
  for (const file of listSourceFiles(srcDir)) {
    hash.update(relative(srcDir, file));
    hash.update(readFileSync(file));
  }
  const sprite = join(root, 'assets', 'drake-spritesheet.png');
  hash.update('assets/drake-spritesheet.png');
  hash.update(readFileSync(sprite));
  return hash.digest('hex').slice(0, 16);
}

const buildId = sourceBuildId();
writeFileSync(join(root, '.build-id'), buildId);

const dev = process.env.DRAKE_DEV === '1';
await build(esbuildOptions({ buildId, dev }));
await build(overlayOptions({ buildId, dev }));

console.log('built dist/index.js and dist/overlay.js');
