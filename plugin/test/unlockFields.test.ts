import { describe, it, expect } from 'vitest';
import { UNLOCKS, unlockIn, isUnlockTarget } from '../src/features/unlockFields';

function field({ cls = '', maxlength = '25' }: { cls?: string; maxlength?: string | null } = {}) {
  const attrs: Record<string, string> = maxlength === null ? {} : { maxlength };
  return {
    className: cls,
    style: {} as { height?: string },
    dataset: {} as Record<string, string | undefined>,
    attrs,
    matches(sel: string): boolean {
      return sel.split(',').some((s: string) => this.className.includes(s.trim().replace('input.', '')));
    },
    getAttribute: (k: string) => attrs[k] ?? null,
    removeAttribute(k: string) { delete attrs[k]; },
    setAttribute(k: string, v: string) { attrs[k] = v; },
  };
}

const asElement = (fake: object): Element => fake as unknown as Element;

function rootWith(fields: object[]): ParentNode {
  return { querySelectorAll: () => fields } as unknown as ParentNode;
}

describe('isUnlockTarget', () => {
  it('recognises the status message input', () => {
    expect(isUnlockTarget(asElement(field({ cls: 'input social-status-change-input' })))).toBe(true);
  });

  it('leaves the chat input alone', () => {



    expect(isUnlockTarget(asElement(field({ cls: 'chat-input' })))).toBe(false);
  });

  it('leaves the summoner-name search field alone', () => {
    expect(isUnlockTarget(asElement(field({ cls: 'player-name-input__game-name-input' })))).toBe(false);
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
    expect(() => unlockIn(hostile as unknown as ParentNode)).not.toThrow();
  });
});

describe('UNLOCKS', () => {
  it('documents the measured limit it is lifting', () => {

    expect(UNLOCKS.statusMessage.measuredMaxLength).toBe(25);
    expect(UNLOCKS.statusMessage.selector).toContain('social-status-change-input');
  });
});
