import { describe, it, expect } from 'vitest';
import { matchesToggle, matchesClose } from '../src/ui/hotkey.js';

const ev = (over = {}) => ({
  ctrlKey: false,
  key: 'a',
  target: { tagName: 'BODY', isContentEditable: false },
  ...over,
});

describe('matchesToggle', () => {
  it('fires on Ctrl+D', () => {
    expect(matchesToggle(ev({ ctrlKey: true, key: 'd' }))).toBe(true);
  });

  it('fires on Ctrl+Shift+D, because Shift is how some layouts send D', () => {
    expect(matchesToggle(ev({ ctrlKey: true, key: 'D' }))).toBe(true);
  });

  it('ignores D without Ctrl', () => {
    expect(matchesToggle(ev({ key: 'd' }))).toBe(false);
  });

  it('ignores other Ctrl combinations', () => {
    expect(matchesToggle(ev({ ctrlKey: true, key: 'k' }))).toBe(false);
  });

  it('does not steal the key while the user types in an input', () => {


    const target = { tagName: 'INPUT', isContentEditable: false };
    expect(matchesToggle(ev({ ctrlKey: true, key: 'd', target }))).toBe(false);
  });

  it('does not steal the key inside a textarea', () => {
    const target = { tagName: 'TEXTAREA', isContentEditable: false };
    expect(matchesToggle(ev({ ctrlKey: true, key: 'd', target }))).toBe(false);
  });

  it('does not steal the key inside a contenteditable', () => {
    const target = { tagName: 'DIV', isContentEditable: true };
    expect(matchesToggle(ev({ ctrlKey: true, key: 'd', target }))).toBe(false);
  });

  it('survives an event with no target', () => {
    expect(matchesToggle({ ctrlKey: true, key: 'd' })).toBe(true);
  });
});

describe('matchesClose', () => {
  it('fires on Escape', () => {
    expect(matchesClose(ev({ key: 'Escape' }))).toBe(true);
  });

  it('does not fire on other keys', () => {
    expect(matchesClose(ev({ key: 'Enter' }))).toBe(false);
  });
});
