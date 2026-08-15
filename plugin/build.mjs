import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  target: 'chrome108',
  outfile: 'dist/index.js',
});
console.log('built dist/index.js');
