import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  define: { __DRAKE_DEV__: 'false' },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['test/app/**', 'jsdom']],
    setupFiles: ['test/setup.js'],
  },
});
