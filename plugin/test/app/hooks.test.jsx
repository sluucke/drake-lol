import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { useSfx } from '../../src/app/hooks/useSfx.js';
import { usePortalTarget } from '../../src/app/hooks/usePortalTarget.js';
import { useReducedMotion } from '../../src/app/hooks/useReducedMotion.js';
import { AppProviders } from '../../src/app/AppProviders.jsx';
import { Layer } from '../../src/app/ui/Layer.jsx';

afterEach(() => {
  delete window.matchMedia;
});

function stubMatchMedia(matches) {
  const listeners = new Set();
  const mql = {
    matches,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  window.matchMedia = vi.fn(() => mql);
  return {
    set(next) {
      mql.matches = next;
      for (const fn of listeners) fn();
    },
  };
}

describe('useSfx', () => {
  it('is a no-op without a provider', () => {
    const { result } = renderHook(() => useSfx());
    expect(() => result.current.play('x')).not.toThrow();
  });

  it('returns the provided player', () => {
    const sfx = { play: vi.fn() };
    const { result } = renderHook(() => useSfx(), {
      wrapper: ({ children }) => <AppProviders sfx={sfx}>{children}</AppProviders>,
    });
    result.current.play('sfx-uikit-button-gold-click');
    expect(sfx.play).toHaveBeenCalledWith('sfx-uikit-button-gold-click');
  });
});

describe('usePortalTarget and Layer', () => {
  it('is null without a provider and Layer renders inline', () => {
    const { result } = renderHook(() => usePortalTarget());
    expect(result.current).toBeNull();
    const { container } = render(<Layer><b>inline</b></Layer>);
    expect(container.querySelector('b').textContent).toBe('inline');
  });

  it('portals Layer children into the target', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const { container } = render(
      <AppProviders portalTarget={target}>
        <Layer><b>floating</b></Layer>
      </AppProviders>,
    );
    expect(container.querySelector('b')).toBeNull();
    expect(target.querySelector('b').textContent).toBe('floating');
  });
});

describe('useReducedMotion', () => {
  it('is false when matchMedia is unavailable', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('follows the media query', () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });
});

describe('App', () => {
  it('renders the app marker inside providers', async () => {
    const { App } = await import('../../src/app/App.jsx');
    render(<App sfx={{ play: vi.fn() }} portalTarget={null} />);
    expect(document.querySelector('[data-drake-app]')).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
