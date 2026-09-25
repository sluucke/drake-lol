import { describe, it, expect } from 'vitest';
import { overlayChromeLayout, OVERLAY_SIZES } from '../src/app/overlays/streaming/overlayLayout.js';

const client = { x: 100, y: 50, width: 1280, height: 720 };

describe('overlayChromeLayout', () => {
  it('places the button, cancel and dodge docks relative to the overlay window', () => {
    const chrome = { x: 700, y: 650, width: 666, height: 106 };
    const layout = overlayChromeLayout(client, chrome);
    expect(layout.fab).toEqual({ left: 100 + 1280 - 14 - 52 - 700, top: 50 + 720 - 14 - 52 - 650 });
    expect(layout.cancel).toEqual({ left: 100 + 640 - 60 - 700, top: 50 + 720 - 48 - 48 - 650 });
    expect(layout.dodge).toEqual({ left: 100 + 1280 - 72 - 110 - 700, top: 50 + 720 - 14 - 48 - 650 });
  });

  it('matches the sizes the tray reserves for each piece', () => {
    expect(OVERLAY_SIZES).toEqual({
      fab: { width: 52, height: 52 },
      cancel: { width: 120, height: 48 },
      dodge: { width: 110, height: 48 },
    });
  });

  it('returns null without bounds', () => {
    expect(overlayChromeLayout(null, null)).toBeNull();
  });
});
