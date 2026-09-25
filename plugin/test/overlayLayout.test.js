import { describe, it, expect } from 'vitest';
import { OVERLAY_SIZES, overlayPieces, toRelative } from '../src/app/overlays/streaming/overlayLayout.js';

const client = { x: 100, y: 50, width: 1280, height: 720 };

describe('overlayPieces', () => {
  it('uses the tray defaults when nothing was moved', () => {
    const pieces = overlayPieces(client, {});
    expect(pieces.fab).toEqual({ x: 100 + 1280 - 14 - 52, y: 50 + 720 - 14 - 52 });
    expect(pieces.cancel).toEqual({ x: 100 + 640 - 60, y: 50 + 720 - 48 - 48 });
    expect(pieces.dodge).toEqual({ x: 100 + 1280 - 72 - 96, y: 50 + 720 - 14 - 32 });
  });

  it('places moved pieces from their relative position, kept inside the client', () => {
    const pieces = overlayPieces(client, { fab: { x: 5000, y: 5000 }, dodge: { x: 10000, y: 10000 } });
    expect(pieces.fab).toEqual({ x: 740, y: 410 });
    expect(pieces.dodge).toEqual({ x: 100 + 1280 - 96, y: 50 + 720 - 32 });
  });

  it('matches the sizes the tray reserves', () => {
    expect(OVERLAY_SIZES).toEqual({
      fab: { width: 52, height: 52 },
      cancel: { width: 120, height: 48 },
      dodge: { width: 96, height: 32 },
    });
  });

  it('returns null without bounds', () => {
    expect(overlayPieces(null, {})).toBeNull();
  });
});

describe('toRelative', () => {
  it('turns an absolute spot into basis points of the client, clamped', () => {
    expect(toRelative(client, { x: 740, y: 410 }, OVERLAY_SIZES.fab)).toEqual({ x: 5000, y: 5000 });
    expect(toRelative(client, { x: 99999, y: -50 }, OVERLAY_SIZES.fab)).toEqual({
      x: Math.round(((1280 - 52) / 1280) * 10000),
      y: 0,
    });
  });
});
