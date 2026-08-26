import { describe, it, expect } from 'vitest';
import { renderShell, renderCreditsModal, CREDITS } from '../src/ui/panel.js';

describe('credits', () => {
  it('puts a help button beside close in the titlebar', () => {
    const html = renderShell();
    expect(html).toMatch(/id="credits-open"[^>]*>\s*\?\s*</);
    expect(html).toContain('id="close"');
    const helpAt = html.indexOf('id="credits-open"');
    const closeAt = html.indexOf('id="close"');
    expect(helpAt).toBeGreaterThan(-1);
    expect(closeAt).toBeGreaterThan(helpAt);
  });

  it('embeds a hidden credits modal in the shell', () => {
    const html = renderShell();
    expect(html).toContain('id="credits-modal"');
    expect(html).toMatch(/id="credits-modal"[^>]*hidden/);
  });

  it('lists the same credit roles as lol-profiler-tool plus Sona', () => {
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

  it('renders credit links and a GitHub action', () => {
    const html = renderCreditsModal();
    expect(html).toContain('Credits');
    expect(html).toContain('David William');
    expect(html).toContain('Bieelyi');
    expect(html).toContain('Tiamat');
    expect(html).toContain('Sona');
    expect(html).toContain('Community Dragon');
    expect(html).toContain('data-credit-href="https://github.com/sluucke"');
    expect(html).toContain('data-credit-href="https://github.com/WJZ-P/sona"');
    expect(html).toContain('data-credit-open-repo');
    expect(html).toMatch(/unofficial/i);
  });
});
