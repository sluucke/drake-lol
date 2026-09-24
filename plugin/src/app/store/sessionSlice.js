import { DEFAULT_LOCALE } from '../i18n/runtime.js';

export function createSessionSlice({ appVersion }) {
  return (set) => ({
    session: {
      appVersion,
      locale: DEFAULT_LOCALE,
      idle: false,
      statusText: '',
      updateUi: { phase: 'idle' },
    },

    setLocale(locale) {
      set((state) => ({ session: { ...state.session, locale } }));
    },

    setSession(partial) {
      set((state) => ({ session: { ...state.session, ...partial } }));
    },
  });
}
