import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));

function listSourceFiles(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) listSourceFiles(path, out);
    else if (name.endsWith('.js') || name.endsWith('.svg') || name.endsWith('.png')) out.push(path);
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

await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  target: 'chrome108',
  outfile: 'dist/index.js',
  loader: { '.png': 'dataurl' },
  define: { __DRAKE_BUILD__: JSON.stringify(buildId) },
  plugins: [
    {
      name: 'svg-text',
      setup(buildApi) {
        buildApi.onResolve({ filter: /\.svg(\?raw)?$/ }, (args) => ({
          path: join(dirname(args.importer), args.path.replace(/\?raw$/, '')),
          namespace: 'svg-text',
        }));
        buildApi.onLoad({ filter: /.*/, namespace: 'svg-text' }, (args) => ({
          contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf8'))}`,
          loader: 'js',
        }));
      },
    },
  ],
});

console.log('built dist/index.js');
