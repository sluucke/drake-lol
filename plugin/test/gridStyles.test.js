import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const block = (css, selector) => {
  const i = css.indexOf(`${selector} {`);
  expect(i, `${selector} must exist`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

describe('image grids keep their rows', () => {
  it('sizes champion rows by their content instead of squeezing them into the scroll box', () => {
    const css = read('../src/app/screens/champions/champions.css');
    expect(block(css, '.drk-champ-grid')).toMatch(/grid-auto-rows:\s*max-content/);
    expect(block(css, '.drk-champ-grid')).toMatch(/flex-shrink:\s*0/);
  });

  it('gives skin rows a fixed height and keeps the viewport from shrinking', () => {
    const css = read('../src/app/screens/profile/profile.css');
    expect(block(css, '.drk-skin-grid')).toMatch(/grid-auto-rows:\s*84px/);
    expect(block(css, '.drk-skin-viewport')).toMatch(/flex-shrink:\s*0/);
  });
});
