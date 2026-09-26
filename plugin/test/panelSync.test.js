import { describe, it, expect } from 'vitest';
import { createPanelSync } from '../src/features/panelSync.js';

describe('createPanelSync', () => {
  it('applies remote changes that differ from the local state', () => {
    const sync = createPanelSync({ now: () => 0 });
    expect(sync.remote(true, false)).toBe('apply');
    expect(sync.remote(false, true)).toBe('apply');
    expect(sync.remote(true, true)).toBe('noop');
  });

  it('rejects a stale remote open right after a local close', () => {
    let t = 1000;
    const sync = createPanelSync({ now: () => t });
    sync.localChange(false);
    expect(sync.remote(true, false)).toBe('reject');
    t += 1600;
    expect(sync.remote(true, false)).toBe('apply');
  });

  it('does not block remote opens after a local open', () => {
    const sync = createPanelSync({ now: () => 0 });
    sync.localChange(true);
    expect(sync.remote(false, true)).toBe('apply');
  });
});
