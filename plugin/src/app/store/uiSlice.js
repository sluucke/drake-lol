export function createUiSlice() {
  return (set) => ({
    ui: { panelOpen: false, screen: 'auto-accept', overlay: '', tourIndex: -1 },

    setPanelOpen(open) {
      set((state) => ({ ui: { ...state.ui, panelOpen: !!open } }));
    },

    setUi(partial) {
      set((state) => ({ ui: { ...state.ui, ...partial } }));
    },
  });
}
