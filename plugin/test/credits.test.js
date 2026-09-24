import { describe, it, expect } from 'vitest';
import { renderShell } from '../src/ui/panel.js';

describe('credits', () => {
  it('no longer renders the panel chrome or the docks in the legacy shell', () => {
    const html = renderShell();
    expect(html).not.toContain('id="scrim"');
    expect(html).not.toContain('id="credits-modal"');
    expect(html).not.toContain('id="cancel-dock"');
    expect(html).not.toContain('id="dodge-dock"');
  });
});
