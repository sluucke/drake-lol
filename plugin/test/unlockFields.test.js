import { describe, it, expect, vi } from 'vitest';
import { UNLOCKS, unlockIn, isUnlockTarget } from '../src/features/unlockFields.js';

/// Minimal element stand-in: enough to record attribute and style changes.
function field({ cls = '', maxlength = '25' } = {}) {
  const attrs = maxlength === null ? {} : { maxlength };
  return {
    className: cls,
    style: {},
    dataset: {},
    attrs,
    matches(sel) {
      return sel.split(',').some((s) => this.className.includes(s.trim().replace('input.', '')));
    },
    getAttribute: (k) => attrs[k] ?? null,
    removeAttribute(k) { delete attrs[k]; },
    setAttribute(k, v) { attrs[k] = v; },
  };
}

function rootWith(fields) {
  return { querySelectorAll: () => fields };
}

describe('isUnlockTarget', () => {
  it('recognises the status message input', () => {
    expect(isUnlockTarget(field({ cls: 'input social-status-change-input' }))).toBe(true);
  });

  it('leaves the chat input alone', () => {
    // Chat's 200-char cap is Riot's rule for messages other people receive.
    // Lifting it is a different decision than lifting our own status limit,
    // and not one the user asked for.
    expect(isUnlockTarget(field({ cls: 'chat-input' }))).toBe(false);
  });

  it('leaves the summoner-name search field alone', () => {
    expect(isUnlockTarget(field({ cls: 'player-name-input__game-name-input' }))).toBe(false);
  });
});

describe('unlockIn', () => {
  it('removes the character limit from the status input', () => {
    const f = field({ cls: 'input social-status-change-input', maxlength: '25' });

    unlockIn(rootWith([f]));

    expect(f.getAttribute('maxlength')).toBe(null);
  });

  it('leaves the height alone, because a taller single-line input is a lie', () => {
    // An <input> cannot render a second line however tall it is; the extra
    // height only centres one line in a big box. Multiline belongs in Drake's
    // own Status screen.
    const f = field({ cls: 'input social-status-change-input' });

    unlockIn(rootWith([f]));

    expect(f.style.height).toBeUndefined();
  });

  it('marks what it touched so repeated scans are cheap and idempotent', () => {
    // A MutationObserver fires constantly in this client; re-patching the same
    // node on every mutation would be pure waste.
    const f = field({ cls: 'input social-status-change-input' });

    unlockIn(rootWith([f]));
    f.setAttribute('maxlength', '25');
    unlockIn(rootWith([f]));

    expect(f.dataset.drakeUnlocked).toBe('1');
    // Already marked, so the second pass must not run again.
    expect(f.getAttribute('maxlength')).toBe('25');
  });

  it('reports how many fields it unlocked, so a silent no-op is visible', () => {
    // The selector points into Riot's own markup and can stop matching after
    // any patch. Returning a count lets the caller say so out loud instead of
    // quietly doing nothing.
    const found = unlockIn(rootWith([field({ cls: 'input social-status-change-input' })]));
    expect(found).toBe(1);

    expect(unlockIn(rootWith([field({ cls: 'chat-input' })]))).toBe(0);
  });

  it('survives a root that cannot be queried', () => {
    const hostile = { querySelectorAll() { throw new Error('detached'); } };
    expect(() => unlockIn(hostile)).not.toThrow();
  });
});

describe('UNLOCKS', () => {
  it('documents the measured limit it is lifting', () => {
    // If Riot changes the cap, the recorded value is how we notice.
    expect(UNLOCKS.statusMessage.measuredMaxLength).toBe(25);
    expect(UNLOCKS.statusMessage.selector).toContain('social-status-change-input');
  });
});
