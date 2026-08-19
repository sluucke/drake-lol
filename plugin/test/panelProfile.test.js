import { describe, it, expect } from 'vitest';
import { renderProfile } from '../src/ui/panel.js';

describe('renderProfile', () => {
  it('puts badge actions on the rank tab', () => {
    const html = renderProfile({
      tab: 'rank',
      lol: {},
      skins: [],
      skinQuery: '',
      backgroundId: 0,
      skinScroll: 0,
    });

    expect(html).toContain('id="badges-remove"');
    expect(html).toContain('Remove badges');
    expect(html).toContain('id="badges-clone"');
    expect(html).toContain('Clone first to all 3');
  });
});
