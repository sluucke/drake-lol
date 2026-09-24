import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DURATION, EASE_OUT, EASE_SPRING, STAGGER, MAX_STAGGERED } from '../src/app/ui/motion.js';

const css = readFileSync(new URL('../src/app/styles/tokens.css', import.meta.url), 'utf8');

const REQUIRED = [
  '--gold-1', '--gold-2', '--gold-3', '--gold-4', '--gold-5',
  '--hex-1', '--hex-2', '--hex-3', '--hex-4', '--hex-5',
  '--surface-0', '--surface-1', '--surface-2', '--surface-3',
  '--text-strong', '--text', '--text-muted',
  '--win', '--loss', '--warn', '--danger',
  '--border', '--border-strong', '--focus',
  '--font-heading', '--font-text',
  '--text-xs', '--text-sm', '--text-md', '--text-lg', '--text-xl', '--text-2xl',
  '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-7', '--space-8',
  '--radius-sm', '--radius-md', '--radius-lg',
  '--shadow-1', '--glow-gold', '--glow-hex',
  '--dur-fast', '--dur-base', '--dur-slow', '--ease-out', '--ease-spring',
];

function tokenValue(name) {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

describe('design tokens', () => {
  it('declares every required token on :host', () => {
    expect(css).toMatch(/:host\s*\{/);
    for (const name of REQUIRED) expect(tokenValue(name), name).not.toBeNull();
  });

  it('aliases the client fonts without self reference', () => {
    expect(tokenValue('--font-heading')).toContain('var(--font-display');
    expect(tokenValue('--font-text')).toContain('var(--font-body');
  });

  it('keeps css durations and js durations in sync', () => {
    expect(tokenValue('--dur-fast')).toBe(`${DURATION.fast * 1000}ms`);
    expect(tokenValue('--dur-base')).toBe(`${DURATION.base * 1000}ms`);
    expect(tokenValue('--dur-slow')).toBe(`${DURATION.slow * 1000}ms`);
  });

  it('keeps css easings and js easings in sync', () => {
    expect(tokenValue('--ease-out')).toBe(`cubic-bezier(${EASE_OUT.join(', ')})`);
    expect(tokenValue('--ease-spring')).toBe(`cubic-bezier(${EASE_SPRING.join(', ')})`);
  });

  it('exposes list stagger rules', () => {
    expect(STAGGER).toBe(0.03);
    expect(MAX_STAGGERED).toBe(10);
  });
});
