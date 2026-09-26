import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { Select } from '../../../src/app/ui/Select.jsx';
import { SFX } from '../../../src/ui/sfx.js';

const OPTIONS = [
  { value: 'na1', label: 'North America' },
  { value: 'br1', label: 'Brazil', icon: 'br.png' },
  { value: 'euw1', label: 'Europe West' },
];

function open(label = 'North America') {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('Select', () => {
  it('shows the selected label and opens the list in the portal target', () => {
    const { portalTarget, sfx } = renderWithProviders(<Select value="na1" options={OPTIONS} onChange={() => {}} />);
    open();
    const list = within(portalTarget).getByRole('listbox');
    expect(within(list).getAllByRole('option')).toHaveLength(3);
    expect(within(list).getByRole('option', { name: 'North America' }).getAttribute('aria-selected')).toBe('true');
    expect(sfx.play).toHaveBeenCalledWith(SFX.select);
  });

  it('renders the selected option icon in the trigger', () => {
    renderWithProviders(<Select value="br1" options={OPTIONS} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Brazil' }).querySelector('img').getAttribute('src')).toBe('br.png');
  });

  it('picks an option, emits the value and closes', async () => {
    const onChange = vi.fn();
    const { portalTarget } = renderWithProviders(<Select value="na1" options={OPTIONS} onChange={onChange} />);
    open();
    fireEvent.click(within(portalTarget).getByRole('option', { name: 'Europe West' }));
    expect(onChange).toHaveBeenCalledWith('euw1');
    await waitFor(() => expect(within(portalTarget).queryByRole('listbox')).toBeNull());
  });

  it('does not emit when re-picking the current value', () => {
    const onChange = vi.fn();
    const { portalTarget } = renderWithProviders(<Select value="na1" options={OPTIONS} onChange={onChange} />);
    open();
    fireEvent.click(within(portalTarget).getByRole('option', { name: 'North America' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes on outside pointerdown and on Escape', async () => {
    const { portalTarget } = renderWithProviders(<Select value="na1" options={OPTIONS} onChange={() => {}} />);
    open();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(within(portalTarget).queryByRole('listbox')).toBeNull());
    open();
    expect(within(portalTarget).getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(within(portalTarget).queryByRole('listbox')).toBeNull());
  });

  it('stays closed when disabled', () => {
    const { portalTarget } = renderWithProviders(<Select value="na1" options={OPTIONS} disabled onChange={() => {}} />);
    open();
    expect(within(portalTarget).queryByRole('listbox')).toBeNull();
  });
});
