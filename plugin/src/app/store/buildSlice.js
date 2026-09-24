export const BUILD_DEFAULTS = {
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

export function createBuildSlice() {
  return (set) => ({
    build: { ...BUILD_DEFAULTS, topPlayers: { ...BUILD_DEFAULTS.topPlayers } },

    setBuild(snapshot) {
      set({ build: snapshot });
    },
  });
}
