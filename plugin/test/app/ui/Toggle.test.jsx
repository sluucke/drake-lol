import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { Toggle } from '../../../src/app/ui/Toggle.jsx';
import { SFX } from '../../../src/ui/sfx.js';

describe('Toggle', () => {
  it('exposes switch semantics', () => {
    renderWithProviders(<Toggle checked label="Auto accept" help="Accepts matches" onChange={() => {}} />);
    const sw = screen.getByRole('switch', { name: 'Auto accept' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.className).toContain('is-on');
    expect(screen.getByText('Accepts matches').id).toBe(sw.getAttribute('aria-describedby'));
  });

  it('emits the negated value and plays the check sound', () => {
    const onChange = vi.fn();
    const { sfx } = renderWithProviders(<Toggle checked={false} label="X" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(sfx.play).toHaveBeenCalledWith(SFX.check);
  });

  it('toggles when the label is clicked', () => {
    const onChange = vi.fn();
    renderWithProviders(<Toggle checked label="Label click" onChange={onChange} />);
    fireEvent.click(screen.getByText('Label click'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('ignores clicks when disabled', () => {
    const onChange = vi.fn();
    renderWithProviders(<Toggle checked={false} disabled label="X" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
