import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { TextInput } from '../../../src/app/ui/TextInput.jsx';

describe('TextInput', () => {
  it('reports edits and commits on blur and Enter', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    renderWithProviders(<TextInput value="gl" ariaLabel="Message" onChange={onChange} onCommit={onCommit} />);
    const input = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(input, { target: { value: 'gl hf' } });
    expect(onChange).toHaveBeenCalledWith('gl hf');
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('can be disabled', () => {
    renderWithProviders(<TextInput value="" ariaLabel="Message" disabled />);
    expect(screen.getByRole('textbox', { name: 'Message' }).disabled).toBe(true);
  });
});
