import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { Segmented } from '../../../src/app/ui/Segmented.jsx';
import { SFX } from '../../../src/ui/sfx.js';

const OPTIONS = [
  { value: 'porofessor', label: 'Porofessor' },
  { value: 'opgg', label: 'OP.GG' },
];

describe('Segmented', () => {
  it('marks the selected option', () => {
    renderWithProviders(<Segmented options={OPTIONS} value="opgg" ariaLabel="Site" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Site' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'OP.GG' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Porofessor' }).getAttribute('aria-checked')).toBe('false');
  });

  it('emits new values with the radio sound and ignores the active one', () => {
    const onChange = vi.fn();
    const { sfx } = renderWithProviders(<Segmented options={OPTIONS} value="porofessor" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Porofessor' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'OP.GG' }));
    expect(onChange).toHaveBeenCalledWith('opgg');
    expect(sfx.play).toHaveBeenCalledWith(SFX.radio);
  });
});
