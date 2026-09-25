import { describe, it, expect } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders.jsx';
import { DevShowcase, Showcase, matchesShowcaseToggle } from '../../src/app/dev/Showcase.jsx';

describe('showcase', () => {
  it('matches only Ctrl+Shift+F12', () => {
    expect(matchesShowcaseToggle({ ctrlKey: true, shiftKey: true, key: 'F12' })).toBe(true);
    expect(matchesShowcaseToggle({ ctrlKey: true, shiftKey: false, key: 'F12' })).toBe(false);
    expect(matchesShowcaseToggle({ ctrlKey: false, shiftKey: true, key: 'F12' })).toBe(false);
  });

  it('renders every primitive', () => {
    renderWithProviders(<Showcase />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(3);
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getByRole('slider')).toBeTruthy();
    expect(document.querySelector('.drk-skel')).not.toBeNull();
    expect(document.querySelector('.drk-select')).not.toBeNull();
  });

  it('toggles the showcase modal with the hotkey', () => {
    const { portalTarget } = renderWithProviders(<DevShowcase />);
    expect(within(portalTarget).queryByRole('dialog')).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'F12', ctrlKey: true, shiftKey: true });
    });
    expect(within(portalTarget).getByRole('dialog', { name: 'Design system' })).toBeTruthy();
  });
});
