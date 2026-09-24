import { describe, it, expect } from 'vitest';
import { renderShell, CREDITS } from '../src/ui/panel.js';

describe('credits', () => {
  it('no longer renders the panel chrome or the docks in the legacy shell', () => {
    const html = renderShell();
    expect(html).not.toContain('id="scrim"');
    expect(html).not.toContain('id="credits-modal"');
    expect(html).not.toContain('id="cancel-dock"');
    expect(html).not.toContain('id="dodge-dock"');
  });

  it('keeps the credit entries', () => {
    expect(CREDITS.createdBy).toEqual({
      label: 'David William',
      href: 'https://github.com/sluucke',
    });
    expect(CREDITS.specialThanks).toEqual({
      label: 'Bieelyi',
      href: 'https://twitch.tv/bieelyi',
    });
    expect(CREDITS.inspiredBy).toEqual([
      { label: 'Tiamat', href: 'https://github.com/369gabriel/tiamat' },
      { label: 'Sona', href: 'https://github.com/WJZ-P/sona' },
    ]);
    expect(CREDITS.assets).toEqual({
      label: 'Community Dragon',
      href: 'https://www.communitydragon.org',
    });
    expect(CREDITS.repoUrl).toBe('https://github.com/sluucke/drake-lol');
  });
});
