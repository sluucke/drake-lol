import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { Skeleton } from '../../../src/app/ui/Skeleton.jsx';

describe('Skeleton', () => {
  it('renders a hidden line with the given size', () => {
    const { container } = renderWithProviders(<Skeleton width={120} height={10} radius={2} />);
    const el = container.querySelector('.drk-skel');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.className).toContain('drk-skel--line');
    expect(el.style.width).toBe('120px');
    expect(el.style.height).toBe('10px');
    expect(el.style.borderRadius).toBe('2px');
  });

  it('renders circles with equal sides', () => {
    const { container } = renderWithProviders(<Skeleton variant="circle" width={32} />);
    const el = container.querySelector('.drk-skel');
    expect(el.style.height).toBe('32px');
    expect(el.style.borderRadius).toBe('50%');
  });
});
