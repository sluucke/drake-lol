export function createUiSlice() {
  return (set) => ({
    ui: {
      panelOpen: false,
      screen: 'auto-accept',
      overlay: '',
      tourIndex: -1,
      creditsOpen: false,
      escapeLayers: 0,
      autoPickRole: 'TOP',
      championQueries: { 'auto-pick': '', 'auto-ban': '' },
      skinQuery: '',
    },

    setPanelOpen(open) {
      set((state) => ({ ui: { ...state.ui, panelOpen: !!open } }));
    },

    setUi(partial) {
      set((state) => ({ ui: { ...state.ui, ...partial } }));
    },

    setCreditsOpen(open) {
      set((state) => ({ ui: { ...state.ui, creditsOpen: !!open } }));
    },

    pushEscapeLayer() {
      set((state) => ({ ui: { ...state.ui, escapeLayers: state.ui.escapeLayers + 1 } }));
    },

    popEscapeLayer() {
      set((state) => ({ ui: { ...state.ui, escapeLayers: Math.max(0, state.ui.escapeLayers - 1) } }));
    },
  });
}
