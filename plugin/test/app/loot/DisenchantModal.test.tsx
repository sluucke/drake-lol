import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore';
import { DisenchantModal } from '../../../src/app/overlays/loot/DisenchantModal';
import { EMPTY_TOTALS, planTotals } from '../../../src/features/loot';
import type { DisenchantEntry, DisenchantOptions, DisenchantResult, LootItem } from '../../../src/features/loot';
import { lootItems } from './lootFixtures';
import { BLUE_ESSENCE_ICON, LEGACY_ICON, ORANGE_ESSENCE_ICON } from '../../../src/ui/assets';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface SetupOptions {
  loadLoot?: () => Promise<LootItem[]>;
  disenchantLoot?: (plan: readonly DisenchantEntry[], options?: DisenchantOptions) => Promise<DisenchantResult>;
}

function okResult(plan: readonly DisenchantEntry[], inventory: LootItem[] | null = []): DisenchantResult {
  return { done: [...plan], failed: [], skipped: [], cancelled: false, gained: planTotals(plan), inventory };
}

function setup({ loadLoot, disenchantLoot }: SetupOptions = {}) {
  const store = createDrakeStore();
  const actions = {
    loadLoot: vi.fn(loadLoot ?? (async () => lootItems())),
    disenchantLoot: vi.fn(disenchantLoot ?? (async (plan: readonly DisenchantEntry[]) => okResult(plan))),
  };
  const onClose = vi.fn();
  const utils = renderWithProviders(<DisenchantModal open onClose={onClose} />, { store, actions });
  const dialog = () => within(utils.portalTarget).getByRole('dialog');
  return { ...utils, actions, onClose, dialog };
}

function tile(dialog: HTMLElement, name: string) {
  return within(dialog).getByRole('button', { name });
}

async function ready() {
  const utils = setup();
  await waitFor(() => expect(tile(utils.dialog(), 'Ahri')).toBeTruthy());
  return utils;
}

describe('DisenchantModal', () => {
  it('shows skeleton tiles while loading', () => {
    const { dialog } = setup({ loadLoot: () => new Promise<LootItem[]>(() => {}) });
    expect(dialog().querySelector('[data-loading="true"]')).not.toBeNull();
  });

  it('shows an error with a retry when the loot API fails', async () => {
    let calls = 0;
    const { dialog, actions } = setup({
      loadLoot: async () => {
        calls += 1;
        if (calls === 1) throw new Error('down');
        return lootItems();
      },
    });
    await waitFor(() => expect(within(dialog()).getByRole('alert').textContent).toContain('Could not load your loot.'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(tile(dialog(), 'Ahri')).toBeTruthy());
    expect(actions.loadLoot).toHaveBeenCalledTimes(2);
  });

  it('shows the empty inventory state', async () => {
    const { dialog } = setup({ loadLoot: async () => [] });
    await waitFor(() => expect(within(dialog()).getByText('No champion or skin shards in your loot.')).toBeTruthy());
  });

  it('starts on owned champion shards and lets the filters widen it', async () => {
    const { dialog } = await ready();
    expect(within(dialog()).queryByRole('button', { name: 'Annie' })).toBeNull();
    expect(tile(dialog(), 'Ashe')).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Only champions I own' }));
    expect(tile(dialog(), 'Annie')).toBeTruthy();
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Search by name' }), { target: { value: 'ash' } });
    expect(within(dialog()).queryByRole('button', { name: 'Ahri' })).toBeNull();
    expect(tile(dialog(), 'Ashe')).toBeTruthy();
  });

  it('shows skins with legacy and owned marks and filters by legacy and rarity', async () => {
    const { dialog } = await ready();
    fireEvent.click(within(dialog()).getByRole('tab', { name: 'Skins' }));
    const goth = tile(dialog(), 'Goth Annie');
    expect(goth.querySelector('img.drk-loot-tile__legacy')?.getAttribute('title')).toBe('Legacy');
    expect(goth.textContent).toContain('×3');
    expect(tile(dialog(), 'Spirit Blossom Ahri').querySelector('[data-owned="true"]')).not.toBeNull();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Legacy only' }));
    expect(within(dialog()).queryByRole('button', { name: 'Spirit Blossom Ahri' })).toBeNull();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Legacy only' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Rarity' }));
    fireEvent.click(within(document.body).getByRole('option', { name: 'Legendary' }));
    expect(within(dialog()).queryByRole('button', { name: 'Goth Annie' })).toBeNull();
    expect(tile(dialog(), 'Spirit Blossom Ahri')).toBeTruthy();
  });

  it('selects tiles and sums the essence', async () => {
    const { dialog } = await ready();
    const blue = () => dialog().querySelector('.drk-loot-summary [data-essence="blue"] strong')?.textContent;
    const orange = () => dialog().querySelector('.drk-loot-summary [data-essence="orange"] strong')?.textContent;
    fireEvent.click(tile(dialog(), 'Ahri'));
    expect(tile(dialog(), 'Ahri').getAttribute('aria-pressed')).toBe('true');
    expect(blue()).toBe('2,520');
    expect(within(dialog()).getByText('1 item selected')).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('tab', { name: 'Skins' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Select all shown' }));
    expect(orange()).toBe('738');
    expect(within(dialog()).getByText('3 items selected')).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Keep 1 of each' }));
    expect(blue()).toBe('1,260');
    expect(orange()).toBe('312');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Clear' }));
    expect(blue()).toBe('0');
    expect(within(dialog()).getByRole<HTMLButtonElement>('button', { name: 'Disenchant' }).disabled).toBe(true);
  });

  it('asks for confirmation before any craft call', async () => {
    const { dialog, actions } = await ready();
    fireEvent.click(tile(dialog(), 'Ahri'));
    fireEvent.click(tile(dialog(), 'Ashe'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Disenchant' }));
    expect(actions.disenchantLoot).not.toHaveBeenCalled();
    expect(within(dialog()).getByText('Confirm disenchant')).toBeTruthy();
    expect(dialog().textContent).toContain('You are about to disenchant 3 copies:');
    const group = dialog().querySelector<HTMLElement>('[data-category="champion"]');
    expect(group?.querySelector('[data-tree-count]')?.textContent).toBe('3 copies');
    expect(dialog().textContent).toContain('2,610');
    expect(dialog().textContent).toContain('This cannot be undone.');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Back' }));
    expect(actions.disenchantLoot).not.toHaveBeenCalled();
    expect(tile(dialog(), 'Ahri').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Disenchant' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Disenchant now' }));
    expect(actions.disenchantLoot).toHaveBeenCalledTimes(1);
    const plan = actions.disenchantLoot.mock.calls[0][0];
    expect(plan.map((e) => [e.item.lootId, e.repeat])).toEqual([
      ['CHAMPION_RENTAL_103', 2],
      ['CHAMPION_RENTAL_22', 1],
    ]);
    await waitFor(() => expect(within(dialog()).getByText('Disenchant complete')).toBeTruthy());
  });

  it('renders the bundled essence and legacy icons and keeps long names whole in a title', async () => {
    const { dialog } = await ready();
    const ahri = tile(dialog(), 'Ahri');
    expect(ahri.querySelector('img[data-essence-icon="blue"]')?.getAttribute('src')).toBe(BLUE_ESSENCE_ICON);
    expect(ahri.querySelector('.drk-loot-tile__value')?.getAttribute('title')).toBe('2,520 Blue Essence');
    expect(ahri.querySelector('.drk-loot-tile__name')?.getAttribute('title')).toBe('Ahri');
    expect(dialog().querySelector('.drk-loot-summary img[data-essence-icon="orange"]')?.getAttribute('src')).toBe(ORANGE_ESSENCE_ICON);
    fireEvent.click(within(dialog()).getByRole('tab', { name: 'Skins' }));
    const goth = tile(dialog(), 'Goth Annie');
    const legacy = goth.querySelector<HTMLImageElement>('img.drk-loot-tile__legacy');
    expect(legacy?.getAttribute('src')).toBe(LEGACY_ICON);
    expect(legacy?.getAttribute('title')).toBe('Legacy');
    expect(legacy?.getAttribute('alt')).toBe('Legacy');
    expect(goth.querySelector('.drk-loot-tile__value img')?.getAttribute('src')).toBe(ORANGE_ESSENCE_ICON);
    expect(tile(dialog(), 'Spirit Blossom Ahri').querySelector('.drk-loot-tile__name')?.getAttribute('title')).toBe('Spirit Blossom Ahri');
  });

  it('groups the confirmation into a tree with counts and subtotals', async () => {
    const { dialog } = await ready();
    fireEvent.click(tile(dialog(), 'Ahri'));
    fireEvent.click(within(dialog()).getByRole('tab', { name: 'Skins' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Select all shown' }));
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Keep 1 of each' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Disenchant' }));
    const champions = () => dialog().querySelector<HTMLElement>('[data-category="champion"]');
    const skins = () => dialog().querySelector<HTMLElement>('[data-category="skin"]');
    expect(within(champions() as HTMLElement).getByRole('button', { expanded: true }).textContent).toContain('Champions');
    expect(champions()?.querySelector('[data-tree-count]')?.textContent).toBe('1 copy');
    expect(champions()?.querySelector('[data-tree-subtotal]')?.textContent).toBe('1,260');
    expect(skins()?.querySelector('[data-tree-count]')?.textContent).toBe('2 copies');
    expect(skins()?.querySelector('[data-tree-subtotal] img')?.getAttribute('src')).toBe(ORANGE_ESSENCE_ICON);
    const goth = skins()?.querySelector<HTMLElement>('[data-loot-id="CHAMPION_SKIN_RENTAL_1001"]');
    expect(goth?.textContent).toContain('×2');
    expect(goth?.querySelector('.drk-loot-tree__value')?.getAttribute('title')).toBe('312 Orange Essence');
    expect(goth?.querySelector('.drk-loot-tree__thumb img')).toBeNull();
    expect(champions()?.querySelector('.drk-loot-tree__thumb img')?.getAttribute('src')).toBe('/lol-game-data/a/ahri.jpg');
    fireEvent.click(within(skins() as HTMLElement).getByRole('button', { expanded: true }));
    await waitFor(() => expect(skins()?.querySelector('[data-loot-id]')).toBeNull());
    expect(within(skins() as HTMLElement).getByRole('button', { expanded: false })).toBeTruthy();
  });

  it('removes items from the confirmation tree, updating totals, and returns to browse when empty', async () => {
    const { dialog, actions } = await ready();
    fireEvent.click(tile(dialog(), 'Ahri'));
    fireEvent.click(tile(dialog(), 'Ashe'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Disenchant' }));
    const gain = () => dialog().querySelector('.drk-loot-confirm__gain [data-essence="blue"] strong')?.textContent;
    expect(gain()).toBe('2,610');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove Ahri from the selection' }));
    await waitFor(() => expect(dialog().querySelector('[data-loot-id="CHAMPION_RENTAL_103"]')).toBeNull());
    expect(gain()).toBe('90');
    expect(dialog().textContent).toContain('You are about to disenchant 1 copy:');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove Ashe from the selection' }));
    await waitFor(() => expect(tile(dialog(), 'Ahri')).toBeTruthy());
    expect(tile(dialog(), 'Ahri').getAttribute('aria-pressed')).toBe('false');
    expect(tile(dialog(), 'Ashe').getAttribute('aria-pressed')).toBe('false');
    expect(actions.disenchantLoot).not.toHaveBeenCalled();
  });

  it('shows progress, can be stopped, then shows the result with failures', async () => {
    const run = deferred<DisenchantResult>();
    let options: DisenchantOptions | undefined;
    const { dialog, actions } = setup({
      disenchantLoot: (_plan, opts) => {
        options = opts;
        return run.promise;
      },
    });
    await waitFor(() => expect(tile(dialog(), 'Ahri')).toBeTruthy());
    fireEvent.click(tile(dialog(), 'Ahri'));
    fireEvent.click(tile(dialog(), 'Ashe'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Disenchant' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Disenchant now' }));
    const plan = actions.disenchantLoot.mock.calls[0][0];
    act(() => options?.onProgress?.({ index: 0, total: 2, item: plan[0].item }));
    expect(dialog().textContent).toContain('1 of 2');
    expect(dialog().textContent).toContain('Now: Ahri');
    expect(within(dialog()).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
    expect(dialog().querySelector('.drk-modal__close')).toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Stop' }));
    expect(options?.signal?.aborted).toBe(true);
    expect(within(dialog()).getByRole<HTMLButtonElement>('button', { name: 'Stopping…' }).disabled).toBe(true);
    const refreshed = lootItems().filter((item) => item.lootId !== 'CHAMPION_RENTAL_103');
    await act(async () => {
      run.resolve({
        done: [],
        failed: [{ ...plan[0], reason: 'refused', status: 500 }],
        skipped: [plan[1]],
        cancelled: true,
        gained: { ...EMPTY_TOTALS },
        inventory: refreshed,
      });
    });
    expect(within(dialog()).getByText('Disenchant complete')).toBeTruthy();
    expect(dialog().textContent).toContain('0 items disenchanted.');
    expect(dialog().textContent).toContain('Stopped early. 1 item was left untouched.');
    expect(dialog().textContent).toContain('1 item failed:');
    expect(dialog().textContent).toContain('The client refused it (500)');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Back to loot' }));
    expect(within(dialog()).queryByRole('button', { name: 'Ahri' })).toBeNull();
    expect(within(dialog()).getByText('0 items selected')).toBeTruthy();
  });

  it('closes from the result screen', async () => {
    const { dialog, onClose } = await ready();
    fireEvent.click(tile(dialog(), 'Ahri'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Disenchant' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Disenchant now' }));
    await waitFor(() => expect(within(dialog()).getByText('1 item disenchanted.')).toBeTruthy());
    const buttons = within(dialog()).getAllByRole('button', { name: 'Close' });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });
});
