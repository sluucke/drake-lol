import { describe, it, expect } from 'vitest';
import { overlayBase, clientBoundsFromWindow } from '../src/features/overlayBridge.js';

describe('overlayBridge', () => {
  it('builds localhost base', () => {
    expect(overlayBase(48151)).toBe('http://127.0.0.1:48151');
  });

  it('reads client bounds from window-like object', () => {
    expect(
      clientBoundsFromWindow({
        screenX: 10.2,
        screenY: 20.8,
        outerWidth: 1280.4,
        outerHeight: 720.6,
      }),
    ).toEqual({ x: 10, y: 21, width: 1280, height: 721 });
  });
});
