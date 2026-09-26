import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { Tooltip } from '../../../src/app/ui/Tooltip.jsx';

afterEach(() => {
  vi.useRealTimers();
});

describe('Tooltip', () => {
  it('shows after the delay in the portal target and hides on leave', async () => {
    vi.useFakeTimers();
    const { portalTarget } = renderWithProviders(
      <Tooltip content="62% win rate">
        <span>WR</span>
      </Tooltip>,
    );
    const anchor = screen.getByText('WR').parentElement;
    fireEvent.mouseEnter(anchor);
    act(() => vi.advanceTimersByTime(200));
    expect(within(portalTarget).queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(60));
    expect(within(portalTarget).getByRole('tooltip').textContent).toBe('62% win rate');
    expect(anchor.getAttribute('aria-describedby')).toBe(within(portalTarget).getByRole('tooltip').id);
    vi.useRealTimers();
    fireEvent.mouseLeave(anchor);
    await waitFor(() => expect(within(portalTarget).queryByRole('tooltip')).toBeNull());
  });

  it('never shows without content', () => {
    vi.useFakeTimers();
    const { portalTarget } = renderWithProviders(
      <Tooltip content={null}>
        <span>WR</span>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText('WR').parentElement);
    act(() => vi.advanceTimersByTime(500));
    expect(within(portalTarget).queryByRole('tooltip')).toBeNull();
  });
});
