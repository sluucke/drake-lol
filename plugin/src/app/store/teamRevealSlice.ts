import type { MapSideBadge, ScoutRow, SliceCreator } from './types';

export type TeamRevealTab = 'scouting' | 'build';

export type TeamRevealStatusPhase = 'hidden' | 'loading' | 'ready';

export type MuteStatus = 'idle' | 'muting' | 'muted' | 'failed';

export interface TeamRevealState {
  enabled: boolean;
  open: boolean;
  activeTab: TeamRevealTab;
  statusPhase: TeamRevealStatusPhase;
  statusSeq: number;
  muteStatus: MuteStatus;
  side: MapSideBadge | null;
  rows: ScoutRow[];
  buildSig: string;
}

export interface TeamRevealSlice {
  teamReveal: TeamRevealState;
  setTeamReveal(view: Partial<TeamRevealState>): void;
}

export const TEAM_REVEAL_DEFAULTS: TeamRevealState = {
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

export function createTeamRevealSlice(): SliceCreator<TeamRevealSlice> {
  return (set) => ({
    teamReveal: { ...TEAM_REVEAL_DEFAULTS },

    setTeamReveal(view) {
      set((state) => ({ teamReveal: { ...state.teamReveal, ...view } }));
    },
  });
}
