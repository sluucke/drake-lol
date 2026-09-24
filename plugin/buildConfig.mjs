import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SOURCE_EXTENSIONS = ['.js', '.jsx', '.css', '.json', '.svg', '.png'];

export function svgTextPlugin() {
  return {
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
  };
}

export function cssTextPlugin() {
  return {
    name: 'css-text',
    setup(buildApi) {
      buildApi.onLoad({ filter: /\.css$/ }, (args) => ({
        contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf8'))}`,
        loader: 'js',
      }));
    },
  };
}

export function esbuildOptions({ buildId, dev = false }) {
  return {
    entryPoints: ['src/index.js'],
    bundle: true,
    format: 'iife',
    target: 'chrome108',
    outfile: 'dist/index.js',
    loader: { '.png': 'dataurl', '.jsx': 'jsx' },
    jsx: 'automatic',
    define: {
      __DRAKE_BUILD__: JSON.stringify(buildId),
      __DRAKE_DEV__: JSON.stringify(!!dev),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    plugins: [svgTextPlugin(), cssTextPlugin()],
  };
}
