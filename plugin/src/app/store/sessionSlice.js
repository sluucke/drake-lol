import { DEFAULT_LOCALE } from '../i18n/runtime.js';

export function createSessionSlice({ appVersion }) {
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
