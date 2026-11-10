import type { SliceCreator } from './types';

export interface ChampionQueries {
  'auto-pick': string;
  'auto-ban': string;
}

export interface UiState {
  panelOpen: boolean;
  screen: string;
  overlay: string;
  tourIndex: number;
  creditsOpen: boolean;
  escapeLayers: number;
  autoPickRole: string;
  championQueries: ChampionQueries;
  skinQuery: string;
  lootOpen: boolean;
}

export interface UiSlice {
  ui: UiState;
  setPanelOpen(open: boolean): void;
  setUi(partial: Partial<UiState>): void;
  setCreditsOpen(open: boolean): void;
  pushEscapeLayer(): void;
  popEscapeLayer(): void;
}

export function createUiSlice(): SliceCreator<UiSlice> {
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
      lootOpen: false,
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
