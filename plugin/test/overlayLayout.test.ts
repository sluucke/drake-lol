import { describe, it, expect } from 'vitest';
import { OVERLAY_SIZES, lootPiece, overlayPieces, toRelative } from '../src/app/overlays/streaming/overlayLayout';
import type { OverlayClientRect, OverlayPieces } from '../src/app/overlays/streaming/overlayLayout';

const client: OverlayClientRect = { x: 100, y: 50, width: 1280, height: 720 };

function pieces(value: OverlayPieces | null): OverlayPieces {
  if (!value) throw new Error('expected overlay pieces');
  return value;
}

describe('overlayPieces', () => {
  it('uses the tray defaults when nothing was moved', () => {
    const placed = pieces(overlayPieces(client, {}));
    expect(placed.fab).toEqual({ x: 100 + 1280 - 14 - 52, y: 50 + 720 - 14 - 52 });
    expect(placed.cancel).toEqual({ x: 100 + 640 - 60, y: 50 + 720 - 48 - 48 });
    expect(placed.dodge).toEqual({ x: 100 + 1280 - 72 - 96, y: 50 + 720 - 14 - 32 });
  });

  it('places moved pieces from their relative position, kept inside the client', () => {
    const placed = pieces(overlayPieces(client, { fab: { x: 5000, y: 5000 }, dodge: { x: 10000, y: 10000 } }));
    expect(placed.fab).toEqual({ x: 740, y: 410 });
    expect(placed.dodge).toEqual({ x: 100 + 1280 - 96, y: 50 + 720 - 32 });
  });

  it('matches the sizes the tray reserves', () => {
    expect(OVERLAY_SIZES).toEqual({
      fab: { width: 52, height: 52 },
      cancel: { width: 120, height: 48 },
      dodge: { width: 96, height: 32 },
      hint: { width: 200, height: 56 },
      loot: { width: 220, height: 40 },
    });
  });

  it('places the loot button like the tray does, right-aligned at the anchor and kept inside the client', () => {
    const rect = { x: 100, y: 50, width: 1280, height: 720 };
    expect(lootPiece(rect, { top: 166, right: 104 })).toEqual({ x: 100 + 1280 - 104 - 220, y: 50 + 166 });
    expect(lootPiece(rect, { top: 5000, right: 5000 })).toEqual({ x: 100, y: 50 + 720 - 40 });
  });

  it('places the first-time hint above the Drake button, inside the client', () => {
    const placed = pieces(overlayPieces(client, {}, { hint: true }));
    const fab = placed.fab;
    expect(placed.hint).toEqual({ x: fab.x + 52 - 200, y: fab.y - 8 - 56 });
    const top = pieces(overlayPieces(client, { fab: { x: 0, y: 0 } }, { hint: true }));
    expect(top.hint).toEqual({ x: 100, y: 50 });
    expect(pieces(overlayPieces(client, {})).hint).toBeUndefined();
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
