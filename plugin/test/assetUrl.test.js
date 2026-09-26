import { describe, it, expect, afterEach } from 'vitest';
import { gameDataUrl } from '../src/features/assetUrl.js';
import { iconUrl } from '../src/features/champions.js';
import { normaliseSkins } from '../src/features/skins.js';
import { itemIconUrl, spellIconUrl } from '../src/features/gameAssets.js';
import { perkIconUrl, perkStyleIconUrl } from '../src/features/runes.js';

const PROXY = 'http://127.0.0.1:48151/overlay/asset?token=t&path=';

afterEach(() => {
  delete globalThis.__DRAKE_ASSET_PROXY__;
});

describe('gameDataUrl', () => {
  it('keeps client paths untouched inside the client', () => {
    expect(gameDataUrl('/lol-game-data/assets/v1/champion-icons/1.png')).toBe('/lol-game-data/assets/v1/champion-icons/1.png');
  });

  it('routes client paths through the overlay proxy when one is set', () => {
    globalThis.__DRAKE_ASSET_PROXY__ = PROXY;
    expect(gameDataUrl('/lol-game-data/assets/v1/champion-icons/1.png')).toBe(
      `${PROXY}${encodeURIComponent('/lol-game-data/assets/v1/champion-icons/1.png')}`,
    );
  });

  it('leaves absolute, data and empty urls alone', () => {
    globalThis.__DRAKE_ASSET_PROXY__ = PROXY;
    expect(gameDataUrl('https://raw.communitydragon.org/x.png')).toBe('https://raw.communitydragon.org/x.png');
    expect(gameDataUrl('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
    expect(gameDataUrl('')).toBe('');
  });
});

describe('asset builders use the proxy', () => {
  it('covers champion, skin, item, spell and rune icons', () => {
    globalThis.__DRAKE_ASSET_PROXY__ = PROXY;
    const proxied = (url) => expect(url.startsWith(PROXY)).toBe(true);
    proxied(iconUrl(1));
    proxied(normaliseSkins({ 1: { id: 1, name: 'A', tilePath: '/lol-game-data/assets/x.jpg' } })[0].tile);
    proxied(itemIconUrl(3153));
    proxied(spellIconUrl(4));
    proxied(perkIconUrl(8008));
    proxied(perkStyleIconUrl(8000));
  });
});
