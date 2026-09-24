export const TEAM_REVEAL_DEFAULTS = {
  enabled: false,
  open: false,
  activeTab: 'scouting',
  statusPhase: 'hidden',
  statusSeq: 0,
  muteStatus: 'idle',
  side: null,
  rows: [],
  buildSig: '',
};

export function createTeamRevealSlice() {
  return (set) => ({
    teamReveal: { ...TEAM_REVEAL_DEFAULTS },

    setTeamReveal(view) {
      set((state) => ({ teamReveal: { ...state.teamReveal, ...view } }));
    },
  });
}
