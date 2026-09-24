import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider, useFormat, useLocale, useT } from '../../src/app/i18n/I18nProvider.jsx';
import { renderWithProviders } from './renderWithProviders.jsx';
import { Modal } from '../../src/app/ui/Modal.jsx';

function Probe() {
  const t = useT();
  const locale = useLocale();
  const format = useFormat();
  return (
    <div>
      <span data-testid="text">{t('common.close')}</span>
      <span data-testid="plural">{t('time.seconds', { count: 3 })}</span>
      <span data-testid="locale">{locale}</span>
      <span data-testid="number">{format.number(1234.5)}</span>
      <span data-testid="percent">{format.percent(0.625, 1)}</span>
    </div>
  );
}

describe('I18nProvider', () => {
  it('defaults to en_US without a provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('text').textContent).toBe('Close');
    expect(screen.getByTestId('locale').textContent).toBe('en_US');
    expect(screen.getByTestId('number').textContent).toBe('1,234.5');
    expect(screen.getByTestId('percent').textContent).toBe('62.5%');
  });

  it('translates and formats for pt_BR', () => {
    render(
      <I18nProvider locale="pt_BR">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('text').textContent).toBe('Fechar');
    expect(screen.getByTestId('plural').textContent).toBe('3 segundos');
    expect(screen.getByTestId('number').textContent).toBe('1.234,5');
  });

  it('translates the modal close label', () => {
    renderWithProviders(
      <I18nProvider locale="pt_BR">
        <Modal open title="X" onClose={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy();
  });
});
