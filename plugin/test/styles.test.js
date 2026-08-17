import { describe, it, expect } from 'vitest';
import { CSS } from '../src/ui/styles.js';

/// The host is deliberately `pointer-events: none`, so the overlay never eats
/// clicks meant for the client while it is closed. The consequence is a
/// standing trap: every interactive region has to opt back IN, and one that
/// forgets renders perfectly while being completely dead to the mouse. That
/// shipped once.
describe('pointer-events opt-in', () => {
  const block = (selector) => {
    const i = CSS.indexOf(`${selector} {`);
    expect(i, `${selector} must exist in the stylesheet`).toBeGreaterThan(-1);
    return CSS.slice(i, CSS.indexOf('}', i));
  };

  it('the panel backdrop accepts pointer events', () => {
    expect(block('.scrim')).toMatch(/pointer-events:\s*auto/);
  });

  it('the ready-check cancel dock accepts pointer events', () => {
    expect(block('.cancel-dock')).toMatch(/pointer-events:\s*auto/);
  });
});

describe('window', () => {
  const block = (selector) => {
    const i = CSS.indexOf(`${selector} {`);
    expect(i, `${selector} must exist in the stylesheet`).toBeGreaterThan(-1);
    return CSS.slice(i, CSS.indexOf('}', i));
  };

  it('keeps a fixed height so switching tabs does not move the chrome', () => {
    // Content is shorter on Auto Accept than on Auto Pick. Sizing to content
    // recenters the window and the nav items jump out from under the cursor.
    expect(block('.window')).toMatch(/(?:^|[^-])height:\s*86vh/);
  });
});

describe('title mark', () => {
  const block = (selector) => {
    const i = CSS.indexOf(`${selector} {`);
    expect(i, `${selector} must exist in the stylesheet`).toBeGreaterThan(-1);
    return CSS.slice(i, CSS.indexOf('}', i));
  };

  it('fits the duck in the titlebar without stretching it', () => {
    expect(block('.mark')).toMatch(/object-fit:\s*contain/);
  });
});

describe('rank tiles', () => {
  const block = (selector) => {
    const i = CSS.indexOf(`${selector} {`);
    expect(i, `${selector} must exist in the stylesheet`).toBeGreaterThan(-1);
    return CSS.slice(i, CSS.indexOf('}', i));
  };

  it('centers the emblem in the tile, not against one edge', () => {
    expect(block('.rank')).toMatch(/align-items:\s*center/);
    expect(block('.rank')).toMatch(/justify-content:\s*center/);
    expect(block('.rank img')).toMatch(/object-fit:\s*contain/);
    expect(block('.rank img')).toMatch(/object-position:\s*center/);
    expect(block('.rank img')).toMatch(/display:\s*block/);
  });
});
