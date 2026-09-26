import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const block = (css, selector) => {
  const i = css.indexOf(`${selector} {`);
  expect(i, `${selector} must exist`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

describe('client look', () => {
  it('draws choice groups as the old hextech pills', () => {
    const css = read('../src/app/ui/Segmented.css');
    expect(block(css, '.drk-segmented__item.is-active')).toMatch(/linear-gradient\(to bottom, #c8aa6e, #785a28\)/);
    expect(read('../src/app/ui/Segmented.jsx')).not.toContain('thumb');
  });

  it('keeps close buttons square', () => {
    const modal = read('../src/app/ui/Modal.css');
    expect(block(modal, '.drk-modal__close')).toMatch(/border-radius:\s*0/);
    expect(modal).not.toMatch(/border-radius:\s*50%/);
    const champions = read('../src/app/screens/champions/champions.css');
    expect(block(champions, '.drk-pick-summary__remove')).toMatch(/border-radius:\s*0/);
  });

  it('keeps the overlay Drake button round', () => {
    const docks = read('../src/app/overlays/docks/docks.css');
    expect(docks.split('.drk-overlay-fab {').length - 1).toBe(1);
    expect(block(docks, '.drk-overlay-fab')).toMatch(/border-radius:\s*50%/);
  });

  it('brings back the old red hextech dodge button', () => {
    const docks = read('../src/app/overlays/docks/docks.css');
    expect(block(docks, '.drk-hextech-btn')).toMatch(/border-image:\s*linear-gradient\(to bottom, #c8aa6d, #7a5c29\)/);
    expect(block(docks, '.drk-hextech-btn--danger')).toMatch(/linear-gradient\(to bottom, #c33c3c, #6b1f1f\)/);
  });

  it('falls back to installed display fonts outside the client', () => {
    const tokens = read('../src/app/styles/tokens.css');
    expect(tokens).toMatch(/--font-heading:[^;]*Constantia/);
  });

  it('gives the overlay window bundled League-like fonts with Windows fallbacks', () => {
    const page = read('../../src-tauri/overlay/app.css');
    expect(page).toMatch(/--font-display:\s*'Drake Display',\s*'Constantia'/);
    expect(page).toMatch(/--font-body:\s*'Drake Body',\s*'Segoe UI'/);
    for (const file of ['cinzel-400', 'cinzel-700', 'source-sans-3-400', 'source-sans-3-700']) {
      expect(page).toContain(`/overlay/fonts/${file}.woff2`);
    }
  });
});

