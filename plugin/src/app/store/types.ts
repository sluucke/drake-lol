import type { StoreApi } from 'zustand/vanilla';
import type { BuildSlice } from './buildSlice';
import type { ChampSelectSlice } from './champSelectSlice';
import type { SessionSlice, SessionState } from './sessionSlice';
import type { SettingsSlice } from './settingsSlice';
import type { TeamRevealSlice } from './teamRevealSlice';
import type { UiSlice } from './uiSlice';
import type { SettingsValues } from '../../settings';
import type { Champion } from '../../features/champions';
import type { Friend } from '../../features/profile';
import type { SkinTile } from '../../features/skins';

export type { Champion, Friend };
export type Skin = SkinTile;

export interface BuildPickStats {
  winRate?: number | null;
  pickRate?: number | null;
  play?: number;
}

export interface BuildEntry extends BuildPickStats {
  ids: number[];
}

export interface BuildRunePage extends BuildPickStats {
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds?: number[];
}

export interface BuildItems {
  starter?: BuildEntry[];
  boots?: BuildEntry[];
  core?: BuildEntry[];
  last?: BuildEntry[];
}

export interface BuildSkills {
  order?: string[];
  masteries?: string[];
  winRate?: number | null;
  play?: number;
}

export interface BuildCounter {
  championId: number;
  winRate?: number | null;
  play?: number;
}

export interface BuildCounters {
  strong?: BuildCounter[];
  weak?: BuildCounter[];
}

export interface BuildStats {
  winRate?: number | null;
  pickRate?: number | null;
  banRate?: number | null;
  kda?: number | null;
  play?: number;
}

export interface BuildData {
  patch?: string;
  stats?: BuildStats;
  runePages?: BuildRunePage[];
  items?: BuildItems;
  spells?: BuildEntry[];
  skills?: BuildSkills;
  counters?: BuildCounters;
}

export interface TopPlayer {
  name: string;
  tier: string;
  region?: string;
  ranking?: number | null;
  winRate?: number | null;
  played?: number | null;
}

export interface ScoutRank {
  tier?: string;
  division?: string;
  lp?: number;
  hasRank?: boolean;
}

export interface ScoutGame {
  championId: number;
  championName?: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
}

export interface ScoutRow {
  cellId?: number;
  riotId?: string;
  isLocalPlayer?: boolean;
  assignedPosition?: string;
  matchesPending?: boolean;
  matchesUsed?: number;
  soloRank?: ScoutRank;
  flexRank?: ScoutRank;
  wins?: number;
  losses?: number;
  winRate?: number | null;
  kda?: number | string | null;
  last12hWins?: number;
  last12hLosses?: number;
  pickedChampionId?: number;
  pickedChampionName?: string;
  pickedGames?: number;
  pickedWinRate?: number | null;
  seasonMostPlayedChampionId?: number;
  seasonMostPlayedChampionName?: string;
  seasonMostPlayedCount?: number;
  seasonMostPlayedWins?: number;
  seasonMostPlayedLosses?: number;
  seasonMostPlayedWinRate?: number | null;
  recentGames?: ScoutGame[];
}

export interface MapSideBadge {
  side: string;
  color: string;
}

export interface LegacySync extends Partial<SessionState> {
  settings?: SettingsValues;
  trayDown?: boolean;
  screen?: string;
  overlay?: string;
  tourIndex?: number;
}

export interface LegacySyncActions {
  syncLegacy(sync: LegacySync): void;
}

export type DrakeState = SettingsSlice &
  SessionSlice &
  UiSlice &
  TeamRevealSlice &
  BuildSlice &
  ChampSelectSlice &
  LegacySyncActions;

export type DrakeStore = StoreApi<DrakeState>;

export type StoreSet = DrakeStore['setState'];

export type StoreGet = DrakeStore['getState'];

export type SliceCreator<T> = (set: StoreSet, get: StoreGet) => T;
