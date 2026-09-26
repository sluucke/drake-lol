import { describe, it, expect } from 'vitest';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { esbuildOptions, overlayOptions, SOURCE_EXTENSIONS } from '../buildConfig.mjs';

const entry = fileURLToPath(new URL('./fixtures/build/entry.jsx', import.meta.url));

async function bundle(opts) {
  const result = await build({
    ...opts,
    entryPoints: [entry],
    outfile: 'out.js',
    write: false,
  });
  return result.outputFiles[0].text;
}

describe('esbuildOptions', () => {
  it('keeps the legacy output contract', () => {
    const opts = esbuildOptions({ buildId: 'abc' });
    expect(opts.entryPoints).toEqual(['src/index.js']);
    expect(opts.format).toBe('iife');
    expect(opts.target).toBe('chrome108');
    expect(opts.outfile).toBe('dist/index.js');
    expect(opts.define.__DRAKE_BUILD__).toBe('"abc"');
  });

  it('defines production mode and the dev flag', () => {
    expect(esbuildOptions({ buildId: 'x' }).define['process.env.NODE_ENV']).toBe('"production"');
    expect(esbuildOptions({ buildId: 'x' }).define.__DRAKE_DEV__).toBe('false');
    expect(esbuildOptions({ buildId: 'x', dev: true }).define.__DRAKE_DEV__).toBe('true');
  });

  it('minifies production bundles and keeps dev bundles readable', () => {
    expect(esbuildOptions({ buildId: 'x' }).minify).toBe(true);
    expect(esbuildOptions({ buildId: 'x', dev: true }).minify).toBe(false);
  });

  it('builds the streaming overlay bundle with the same pipeline', () => {
    const main = esbuildOptions({ buildId: 'x' });
    const overlay = overlayOptions({ buildId: 'x' });
    expect(overlay.entryPoints).toEqual(['src/overlayMain.jsx']);
    expect(overlay.outfile).toBe('dist/overlay.js');
    expect(overlay.define).toEqual(main.define);
    expect(overlay.minify).toBe(true);
  });

  it('bundles css imports as text and jsx with the automatic runtime', async () => {
    const text = await bundle(esbuildOptions({ buildId: 'x' }));
    expect(text).toContain('.fixture-probe{color:red}');
    expect(text).toContain('react.transitional.element');
    expect(text).not.toContain('react-jsx-runtime.development');
  }, 30000);

  it('hashes jsx, css and json sources', () => {
    expect(SOURCE_EXTENSIONS).toEqual(expect.arrayContaining(['.js', '.jsx', '.css', '.json', '.svg', '.png']));
  });
});
