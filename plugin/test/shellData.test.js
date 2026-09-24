import { describe, it, expect } from 'vitest';
import { CREDITS, SCREENS, formatHostLabel } from '../src/app/shell/shellData.js';

describe('SCREENS', () => {
  it("lists What's New before Settings", () => {
    const ids = SCREENS.map((s) => s.id);
    expect(ids.indexOf('whats-new')).toBeLessThan(ids.indexOf('settings'));
    expect(ids).toContain('whats-new');
  });
});

describe('CREDITS', () => {
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

describe('formatHostLabel', () => {
  it('shows the Drake version alongside the loader version', () => {
    expect(formatHostLabel({ appVersion: '0.3.6', loaderVersion: '1.1.6' })).toBe(
      'drake 0.3.6 · loader 1.1.6',
    );
  });

  it('still shows the Drake version when there is no loader', () => {
    expect(formatHostLabel({ appVersion: '0.3.6', loaderVersion: '' })).toBe(
      'drake 0.3.6 · in client',
    );
  });

  it('falls back to a placeholder when the tray never reported a version', () => {
    expect(formatHostLabel({ appVersion: '', loaderVersion: '1.1.6' })).toBe(
      'drake ? · loader 1.1.6',
    );
  });
});
