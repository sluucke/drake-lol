import { describe, it, expect } from 'vitest';
import { CSS } from '../src/ui/styles.js';
import {
  SCREENS,
  renderShell,
  renderWelcome,
  renderWhatsNew,
  renderTourCard,
} from '../src/ui/panel.js';

describe('onboarding panel', () => {
  it("lists What's New before Settings", () => {
    const ids = SCREENS.map((s) => s.id);
    expect(ids.indexOf('whats-new')).toBeLessThan(ids.indexOf('settings'));
    expect(ids).toContain('whats-new');
  });

  it('shell hosts an onboard layer and non-interactive brand hooks', () => {
    const html = renderShell();
    expect(html).toContain('id="onboard-layer"');
    expect(html).toContain('class="mark"');
    expect(html).toContain('class="title"');
  });

  it('welcome has skip and tour actions', () => {
    const html = renderWelcome();
    expect(html).toContain('data-onboard="skip"');
    expect(html).toContain('data-onboard="tour"');
    expect(html).toMatch(/Drake/i);
  });

  it("what's new links optional screens and continue", () => {
    const html = renderWhatsNew(
      {
        version: '0.3.16',
        items: [{ title: 'Queue tools', body: 'Reveal allies', screen: 'queue' }],
      },
      { version: '0.3.16' },
    );
    expect(html).toContain('data-whats-new-screen="queue"');
    expect(html).toContain('data-onboard="dismiss-whats-new"');
  });

  it("what's new empty state still dismisses", () => {
    const html = renderWhatsNew(null, { version: '0.3.16' });
    expect(html).toMatch(/no notes/i);
    expect(html).toContain('data-onboard="dismiss-whats-new"');
  });

  it('tour card has next and skip', () => {
    const html = renderTourCard(
      { screen: 'queue', title: 'Queue', body: 'Tools for champ select.' },
      { index: 1, total: 5 },
    );
    expect(html).toContain('data-onboard="tour-next"');
    expect(html).toContain('data-onboard="skip"');
  });
});

describe('titlebar brand', () => {
  it('disables pointer events on mark and title', () => {
    expect(CSS).toMatch(/\.mark,\s*\.title\s*\{[^}]*pointer-events:\s*none/);
  });
});
