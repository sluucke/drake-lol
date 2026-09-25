import { describe, it, expect, vi } from 'vitest';
import { collectFontFaces, harvestClientFonts, applyOverlayFonts, toBase64 } from '../../src/features/clientFonts.js';

function addStyle(css) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

describe('collectFontFaces', () => {
  it('finds the League font faces and resolves their urls', () => {
    addStyle(`
      @font-face { font-family: "LoL Display"; src: url("/fe/fonts/display-bold.woff2") format("woff2"); font-weight: 700; }
      @font-face { font-family: 'Spiegel'; src: url(/fe/fonts/spiegel.otf); }
      @font-face { font-family: "Comic Sans"; src: url("/other.woff2"); }
      @font-face { font-family: "LoL Display"; src: url("/fe/fonts/display-bold.woff2"); font-weight: 700; }
    `);
    const faces = collectFontFaces(document, { baseUrl: 'https://127.0.0.1:1234/index.html' });
    expect(faces).toEqual([
      { family: 'LoL Display', weight: '700', style: 'normal', url: 'https://127.0.0.1:1234/fe/fonts/display-bold.woff2' },
      { family: 'Spiegel', weight: 'normal', style: 'normal', url: 'https://127.0.0.1:1234/fe/fonts/spiegel.otf' },
    ]);
  });

  it('skips sheets it is not allowed to read', () => {
    const doc = {
      styleSheets: [
        {
          get cssRules() {
            throw new Error('SecurityError');
          },
        },
      ],
    };
    expect(collectFontFaces(doc, { baseUrl: 'https://x/' })).toEqual([]);
  });
});

describe('harvestClientFonts', () => {
  it('downloads each face and encodes it for the tray', async () => {
    addStyle(`@font-face { font-family: "Beaufort for LOL"; src: url("/fe/fonts/beaufort.ttf"); font-style: italic; }`);
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([0, 1, 2]), { status: 200, headers: { 'content-type': 'font/ttf' } }));
    const fonts = await harvestClientFonts(document, { fetchImpl, baseUrl: 'https://127.0.0.1:1234/' });
    const beaufort = fonts.find((f) => f.family === 'Beaufort for LOL');
    expect(beaufort).toEqual({ family: 'Beaufort for LOL', weight: 'normal', style: 'italic', mime: 'font/ttf', data: 'AAEC' });
  });
});

describe('toBase64', () => {
  it('encodes bytes', () => {
    expect(toBase64(new Uint8Array([104, 105]).buffer)).toBe('aGk=');
  });
});

describe('applyOverlayFonts', () => {
  it('registers each served font once', async () => {
    const added = [];
    class FakeFontFace {
      constructor(family, source, descriptors) {
        Object.assign(this, { family, source, descriptors });
      }
      load() {
        return Promise.resolve(this);
      }
    }
    const doc = { fonts: { add: (face) => added.push(face) } };
    const list = [{ family: 'LoL Display', weight: '700', style: 'normal', url: '/overlay/font/0?token=t' }];
    const loaded = new Set();
    await applyOverlayFonts(list, { base: 'http://127.0.0.1:48151', doc, FontFaceImpl: FakeFontFace, loaded });
    await applyOverlayFonts(list, { base: 'http://127.0.0.1:48151', doc, FontFaceImpl: FakeFontFace, loaded });
    expect(added).toHaveLength(1);
    expect(added[0].family).toBe('LoL Display');
    expect(added[0].source).toBe('url("http://127.0.0.1:48151/overlay/font/0?token=t")');
    expect(added[0].descriptors).toEqual({ weight: '700', style: 'normal' });
  });
});
