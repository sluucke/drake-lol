import { describe, it, expect } from 'vitest';
import { matchesToggle, matchesClose, matchesTeamRevealCardsToggle } from '../src/ui/hotkey.js';

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

  it('does not fire on Ctrl+Shift+D', () => {
    expect(matchesToggle(ev({ ctrlKey: true, shiftKey: true, key: 'D', code: 'KeyD' }))).toBe(false);
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

describe('matchesTeamRevealCardsToggle', () => {
  it('fires on Ctrl+Shift+D', () => {
    expect(matchesTeamRevealCardsToggle(ev({ ctrlKey: true, shiftKey: true, key: 'D', code: 'KeyD' }))).toBe(true);
  });

  it('ignores Ctrl+D without Shift', () => {
    expect(matchesTeamRevealCardsToggle(ev({ ctrlKey: true, shiftKey: false, key: 'd', code: 'KeyD' }))).toBe(false);
  });

  it('ignores Shift+D without Ctrl', () => {
    expect(matchesTeamRevealCardsToggle(ev({ ctrlKey: false, shiftKey: true, key: 'D', code: 'KeyD' }))).toBe(false);
  });

  it('ignores other Ctrl+Shift combos', () => {
    expect(matchesTeamRevealCardsToggle(ev({ ctrlKey: true, shiftKey: true, key: 'K', code: 'KeyK' }))).toBe(false);
  });

  it('accepts layouts where Shift changes D key casing', () => {
    expect(matchesTeamRevealCardsToggle(ev({ ctrlKey: true, shiftKey: true, key: 'd', code: 'KeyD' }))).toBe(true);
  });

  it('still fires while typing in an input', () => {
    const target = { tagName: 'INPUT', isContentEditable: false };
    expect(
      matchesTeamRevealCardsToggle(ev({ ctrlKey: true, shiftKey: true, key: 'D', code: 'KeyD', target })),
    ).toBe(true);
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
