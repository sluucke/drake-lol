import type { BuildData, SliceCreator, TopPlayer } from './types';

export type BuildActionStatus = 'idle' | 'applying' | 'applied' | 'failed';

export interface TopPlayersState {
  loading: boolean;
  ok: boolean;
  players: TopPlayer[];
  reason: string;
}

export interface BuildState {
  championId: number;
  championName: string;
  position: string;
  mode: string;
  tier: string;
  region: string;
  patch: string;
  loading: boolean;
  error: string;
  build: BuildData | null;
  averageBuild: BuildData | null;
  topPlayers: TopPlayersState;
  viewingPlayer: string;
  runeStatus: BuildActionStatus;
  itemSetStatus: BuildActionStatus;
  spellStatus: BuildActionStatus;
  championNames: Record<string, string>;
}

export interface BuildSlice {
  build: BuildState;
  setBuild(snapshot: BuildState): void;
}

export const BUILD_DEFAULTS: BuildState = {
  championId: 0,
  championName: '',
  position: '',
  mode: 'ranked',
  tier: 'emerald_plus',
  region: 'global',
  patch: '',
  loading: false,
  error: '',
  build: null,
  averageBuild: null,
  topPlayers: { loading: false, ok: false, players: [], reason: '' },
  viewingPlayer: '',
  runeStatus: 'idle',
  itemSetStatus: 'idle',
  spellStatus: 'idle',
  championNames: {},
};

export function createBuildSlice(): SliceCreator<BuildSlice> {
  return (set) => ({
    build: { ...BUILD_DEFAULTS, topPlayers: { ...BUILD_DEFAULTS.topPlayers } },

    setBuild(snapshot) {
      set({ build: snapshot });
    },
  });
}
