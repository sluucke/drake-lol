import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { ChampionGrid } from '../../../src/app/screens/champions/ChampionGrid.jsx';
import { ChampionSearch } from '../../../src/app/screens/champions/ChampionSearch.jsx';
import { RoleTabs } from '../../../src/app/screens/champions/RoleTabs.jsx';
import { PickSummary } from '../../../src/app/screens/champions/PickSummary.jsx';
import { SFX } from '../../../src/ui/sfx.js';

const CHAMPIONS = [
  { id: 103, name: 'Ahri', alias: 'Ahri' },
  { id: 55, name: 'Katarina', alias: 'Katarina' },
  { id: 64, name: 'Lee Sin', alias: 'LeeSin' },
  { id: 157, name: 'Yasuo', alias: 'Yasuo' },
];

describe('ChampionGrid', () => {
  it('renders champions with selection and slot badges', () => {
    const slots = new Map([
      [103, 1],
      [64, 2],
    ]);
    renderWithProviders(<ChampionGrid champions={CHAMPIONS} slots={slots} onPick={() => {}} emptyLabel="none" />);
    const ahri = screen.getByRole('button', { name: 'Ahri' });
    expect(ahri.getAttribute('aria-pressed')).toBe('true');
    expect(ahri.className).toContain('is-on');
    expect(ahri.querySelector('.drk-champ__slot').textContent).toBe('1');
    expect(ahri.querySelector('img').getAttribute('src')).toBe('/lol-game-data/assets/v1/champion-icons/103.png');
    expect(screen.getByRole('button', { name: 'Yasuo' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('marks a single selection without a badge', () => {
    renderWithProviders(<ChampionGrid champions={CHAMPIONS} slots={new Map([[55, true]])} onPick={() => {}} emptyLabel="none" />);
    const kat = screen.getByRole('button', { name: 'Katarina' });
    expect(kat.className).toContain('is-on');
    expect(kat.querySelector('.drk-champ__slot')).toBeNull();
  });

  it('picks with the card sound', () => {
    const onPick = vi.fn();
    const { sfx } = renderWithProviders(<ChampionGrid champions={CHAMPIONS} slots={new Map()} onPick={onPick} emptyLabel="none" />);
    fireEvent.click(screen.getByRole('button', { name: 'Yasuo' }));
    expect(onPick).toHaveBeenCalledWith(157);
    expect(sfx.play).toHaveBeenCalledWith(SFX.card);
  });

  it('shows the empty label', () => {
    renderWithProviders(<ChampionGrid champions={[]} slots={new Map()} onPick={() => {}} emptyLabel="No champions match." />);
    expect(screen.getByText('No champions match.')).toBeTruthy();
  });
});

describe('ChampionSearch', () => {
  it('is a translated search box', () => {
    const store = createDrakeStore();
    store.getState().setLocale('pt_BR');
    const onChange = vi.fn();
    renderWithProviders(<ChampionSearch value="" onChange={onChange} />, { store });
    const box = screen.getByRole('searchbox', { name: 'Buscar campeões...' });
    fireEvent.change(box, { target: { value: 'ya' } });
    expect(onChange).toHaveBeenCalledWith('ya');
  });
});

describe('RoleTabs', () => {
  it('lists the five roles with counts and switches', () => {
    const onChange = vi.fn();
    const counts = { TOP: 2, JUNGLE: 0, MIDDLE: 1, BOTTOM: 0, UTILITY: 0 };
    const { sfx } = renderWithProviders(<RoleTabs value="TOP" counts={counts} onChange={onChange} ariaLabel="Roles" />);
    const tabs = within(screen.getByRole('tablist', { name: 'Roles' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('data-role'))).toEqual(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].textContent).toContain('Top');
    expect(tabs[0].textContent).toContain('2');
    fireEvent.click(tabs[0]);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(tabs[2]);
    expect(onChange).toHaveBeenCalledWith('MIDDLE');
    expect(sfx.play).toHaveBeenCalledWith(SFX.tab);
  });

  it('is translated', () => {
    const store = createDrakeStore();
    store.getState().setLocale('pt_BR');
    renderWithProviders(<RoleTabs value="TOP" counts={{}} onChange={() => {}} ariaLabel="Rotas" />, { store });
    expect(screen.getByRole('tab', { name: /Suporte/ })).toBeTruthy();
  });
});

describe('PickSummary', () => {
  it('lists numbered picks and removes them', () => {
    const onRemove = vi.fn();
    renderWithProviders(<PickSummary ids={[103, 64]} champions={CHAMPIONS} numbered emptyLabel="empty" onRemove={onRemove} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('1');
    expect(items[0].textContent).toContain('Ahri');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Lee Sin' }));
    expect(onRemove).toHaveBeenCalledWith(64);
  });

  it('shows the empty text and unknown names', () => {
    const { rerender } = renderWithProviders(<PickSummary ids={[]} champions={CHAMPIONS} emptyLabel="Click a champion" onRemove={() => {}} />);
    expect(screen.getByText('Click a champion')).toBeTruthy();
    rerender(<PickSummary ids={[999]} champions={CHAMPIONS} emptyLabel="x" onRemove={() => {}} />);
    expect(screen.getByText('none chosen')).toBeTruthy();
  });
});
