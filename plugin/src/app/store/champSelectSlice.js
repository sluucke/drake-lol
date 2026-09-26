export const CHAMP_SELECT_DEFAULTS = { active: false, cancelable: false, dodge: 'idle' };

export function createChampSelectSlice() {
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
