import { describe, it, expect, vi } from 'vitest';
import { UNLOCKS, unlockIn, isUnlockTarget } from '../src/features/unlockFields.js';

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



    const f = field({ cls: 'input social-status-change-input' });

    unlockIn(rootWith([f]));

    expect(f.style.height).toBeUndefined();
  });

  it('marks what it touched so repeated scans are cheap and idempotent', () => {


    const f = field({ cls: 'input social-status-change-input' });

    unlockIn(rootWith([f]));
    f.setAttribute('maxlength', '25');
    unlockIn(rootWith([f]));

    expect(f.dataset.drakeUnlocked).toBe('1');

    expect(f.getAttribute('maxlength')).toBe('25');
  });

  it('reports how many fields it unlocked, so a silent no-op is visible', () => {



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

    expect(UNLOCKS.statusMessage.measuredMaxLength).toBe(25);
    expect(UNLOCKS.statusMessage.selector).toContain('social-status-change-input');
  });
});
