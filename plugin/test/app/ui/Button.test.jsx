import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { Button } from '../../../src/app/ui/Button.jsx';
import { SFX } from '../../../src/ui/sfx.js';

describe('Button', () => {
  it('renders variant and size classes', () => {
    renderWithProviders(<Button variant="danger" size="sm">Dodge</Button>);
    const btn = screen.getByRole('button', { name: 'Dodge' });
    expect(btn.className).toContain('drk-btn');
    expect(btn.className).toContain('drk-btn--danger');
    expect(btn.className).toContain('drk-btn--sm');
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('plays the variant click sound and calls onClick', () => {
    const onClick = vi.fn();
    const { sfx } = renderWithProviders(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(sfx.play).toHaveBeenCalledWith(SFX.click);
  });

  it('plays the hover sound on mouse enter', () => {
    const { sfx } = renderWithProviders(<Button variant="secondary">Go</Button>);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Go' }));
    expect(sfx.play).toHaveBeenCalledWith(SFX.hover);
  });

  it('does nothing when disabled', () => {
    const onClick = vi.fn();
    const { sfx } = renderWithProviders(<Button disabled onClick={onClick}>Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    fireEvent.mouseEnter(btn);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(sfx.play).not.toHaveBeenCalled();
  });
});
