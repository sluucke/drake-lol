import type { SliceCreator } from './types';

export type DodgeStatus = 'idle' | 'busy' | 'done' | 'failed';

export interface ChampSelectState {
  active: boolean;
  cancelable: boolean;
  dodge: DodgeStatus;
}

export interface ChampSelectSlice {
  champSelect: ChampSelectState;
  patchChampSelect(partial: Partial<ChampSelectState>): void;
  resetChampSelect(): void;
}

export const CHAMP_SELECT_DEFAULTS: ChampSelectState = { active: false, cancelable: false, dodge: 'idle' };

export function createChampSelectSlice(): SliceCreator<ChampSelectSlice> {
  return (set) => ({
    champSelect: { ...CHAMP_SELECT_DEFAULTS },

    patchChampSelect(partial) {
      set((state) => ({ champSelect: { ...state.champSelect, ...partial } }));
    },

    resetChampSelect() {
      set({ champSelect: { ...CHAMP_SELECT_DEFAULTS } });
    },
  });
}
