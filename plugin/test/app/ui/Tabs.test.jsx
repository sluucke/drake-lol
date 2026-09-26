import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { Tabs } from '../../../src/app/ui/Tabs.jsx';
import { SFX } from '../../../src/ui/sfx.js';

const TABS = [
  { id: 'scouting', label: 'Team Scouting' },
  { id: 'build', label: 'Build' },
];

describe('Tabs', () => {
  it('marks the active tab and renders one indicator', () => {
    const { container } = renderWithProviders(<Tabs tabs={TABS} value="build" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Build' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Team Scouting' }).getAttribute('aria-selected')).toBe('false');
    expect(container.querySelectorAll('.drk-tabs__indicator')).toHaveLength(1);
  });

  it('emits the clicked tab id with the tab sound', () => {
    const onChange = vi.fn();
    const { sfx } = renderWithProviders(<Tabs tabs={TABS} value="build" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Team Scouting' }));
    expect(onChange).toHaveBeenCalledWith('scouting');
    expect(sfx.play).toHaveBeenCalledWith(SFX.tab);
  });

  it('ignores clicks on the active tab', () => {
    const onChange = vi.fn();
    renderWithProviders(<Tabs tabs={TABS} value="build" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Build' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
