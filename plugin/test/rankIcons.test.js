import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../assets/rank');

function contentBox(svg) {
  const tm = svg.match(/transform="translate\(([^)]+)\)\s*scale\(([^)]+)\)"/);
  const [tx, ty] = tm[1].trim().split(/[\s,]+/).map(Number);
  const scale = Number(tm[2]);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const d of svg.matchAll(/\bd="([^"]+)"/g)) {
    const nums = d[1].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = nums[i] * scale + tx;
      const y = nums[i + 1] * scale + ty;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return { minX, minY, maxX, maxY };
}

describe('rank SVGs', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.svg'));

  it('ship one emblem per tier', () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
  });

  it('use a square viewBox centered on the artwork, so tiles line up', () => {
    for (const file of files) {
      const svg = readFileSync(join(DIR, file), 'utf8');
      const vb = svg.match(/viewBox="([^"]+)"/)[1].trim().split(/[\s,]+/).map(Number);
      const [vx, vy, vw, vh] = vb;
      expect(vw, file).toBeCloseTo(vh, 3);

      const { minX, minY, maxX, maxY } = contentBox(svg);
      const contentCx = (minX + maxX) / 2;
      const contentCy = (minY + maxY) / 2;
      expect(vx + vw / 2, `${file} x`).toBeCloseTo(contentCx, 0.5);
      expect(vy + vh / 2, `${file} y`).toBeCloseTo(contentCy, 0.5);
    }
  });
});
