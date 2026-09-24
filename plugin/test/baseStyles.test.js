import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app/styles/base.css', import.meta.url), 'utf8');

describe('base styles', () => {
  it('sizes every box by its border', () => {
    expect(css).toMatch(/box-sizing:\s*border-box/);
  });

  it('styles scrollbars', () => {
    expect(css).toContain('::-webkit-scrollbar');
  });

  it('pads and scrolls the screen content', () => {
    const i = css.indexOf('.drk-panel .content {');
    expect(i).toBeGreaterThan(-1);
    const block = css.slice(i, css.indexOf('}', i));
    expect(block).toMatch(/overflow-y:\s*auto/);
    expect(block).toMatch(/padding:\s*20px 24px/);
  });
});
