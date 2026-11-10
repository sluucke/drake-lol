import type { StreamingEffective } from '../../features/streaming';
import { DEFAULT_LOCALE } from '../i18n/runtime';
import type { Champion, Friend, Skin, SliceCreator } from './types';

export type StatusTone = 'good' | 'bad';

export interface StatusLine {
  text: string;
  tone: StatusTone;
}

export type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'no_installer' | 'error';

export interface UpdateUiState {
  phase: UpdatePhase;
  version?: string;
  message?: string;
}

export type RequiredUpdatePhase = 'required' | 'installing' | 'restarting' | 'reloading' | 'error' | 'dismissed';

export interface RequiredUpdate {
  version: string;
  phase: RequiredUpdatePhase;
  reason?: string;
  message?: string;
}

export interface RevealTiming {
  lastMs: number;
  lastConcurrency: number;
}

export interface ProfileRankDraft {
  tier: string;
  division: string;
  queue: string;
  crystal: string;
}

export type StreamingHost = 'client' | 'overlay';

export interface StreamingInfo {
  host: StreamingHost;
  effective: StreamingEffective;
}

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayGeometry {
  client: OverlayRect | null;
  chrome: OverlayRect | null;
}

export interface SessionState {
  appVersion: string;
  locale: string;
  idle: boolean;
  statusText: string;
  updateUi: UpdateUiState;
  updateRequired: RequiredUpdate | null;
  hostLabel: string;
  statusLine: StatusLine | null;
  revealTiming: RevealTiming;
  champions: Champion[];
  profileTab: string;
  profileRank: ProfileRankDraft;
  skins: Skin[];
  backgroundId: number;
  friends: Friend[];
  streaming: StreamingInfo;
  overlayGeometry: OverlayGeometry | null;
}

export interface SessionSlice {
  session: SessionState;
  setLocale(locale: string): void;
  setSession(partial: Partial<SessionState>): void;
  setStatusLine(line: StatusLine | null): void;
}

export interface SessionSliceOptions {
  appVersion: string;
}

export function createSessionSlice({ appVersion }: SessionSliceOptions): SliceCreator<SessionSlice> {
  return (set) => ({
    session: {
      appVersion,
      locale: DEFAULT_LOCALE,
      idle: false,
      statusText: '',
      updateUi: { phase: 'idle' },
      updateRequired: null,
      hostLabel: '',
      statusLine: null,
      revealTiming: { lastMs: 0, lastConcurrency: 1 },
      champions: [],
      profileTab: 'rank',
      profileRank: { tier: '', division: 'I', queue: 'RANKED_SOLO_5x5', crystal: 'IRON' },
      skins: [],
      backgroundId: 0,
      friends: [],
      streaming: { host: 'client', effective: 'in-client' },
      overlayGeometry: null,
    },

    setLocale(locale) {
      set((state) => ({ session: { ...state.session, locale } }));
    },

    setSession(partial) {
      set((state) => ({ session: { ...state.session, ...partial } }));
    },

    setStatusLine(line) {
      set((state) => ({ session: { ...state.session, statusLine: line || null } }));
    },
  });
}
