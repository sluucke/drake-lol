import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { Card } from '../../../src/app/ui/Card.jsx';

describe('Card', () => {
  it('renders title, actions and body', () => {
    renderWithProviders(
      <Card title="Runes" actions={<span>act</span>} glow>
        <p>body</p>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Runes' })).toBeTruthy();
    expect(screen.getByText('act')).toBeTruthy();
    expect(screen.getByText('body').closest('section').className).toContain('drk-card--glow');
  });

  it('omits the header without title or actions', () => {
    const { container } = renderWithProviders(<Card><p>only</p></Card>);
    expect(container.querySelector('.drk-card__head')).toBeNull();
  });
});
