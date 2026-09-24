import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { Slider } from '../../../src/app/ui/Slider.jsx';
import { SFX } from '../../../src/ui/sfx.js';

describe('Slider', () => {
  it('shows the formatted value and fill percent', () => {
    renderWithProviders(
      <Slider value={2500} min={0} max={10000} step={500} ariaLabel="Delay" format={(v) => `${v / 1000}s`} onChange={() => {}} />,
    );
    const input = screen.getByRole('slider', { name: 'Delay' });
    expect(input.style.getPropertyValue('--drk-slider-fill')).toBe('25%');
    expect(screen.getByText('2.5s')).toBeTruthy();
  });

  it('emits numbers and plays a tick on release', () => {
    const onChange = vi.fn();
    const { sfx } = renderWithProviders(<Slider value={0} max={10} ariaLabel="Delay" onChange={onChange} />);
    const input = screen.getByRole('slider', { name: 'Delay' });
    fireEvent.change(input, { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith(7);
    fireEvent.pointerUp(input);
    expect(sfx.play).toHaveBeenCalledWith(SFX.check);
  });
});
