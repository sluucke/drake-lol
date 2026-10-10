// @ts-nocheck
import { createStore } from 'zustand/vanilla';
import { createSettingsSlice } from './settingsSlice';
import { createSessionSlice } from './sessionSlice';
import { createUiSlice } from './uiSlice';
import { createTeamRevealSlice } from './teamRevealSlice';
import { createBuildSlice } from './buildSlice';
import { createChampSelectSlice } from './champSelectSlice';

function defined(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

export function createDrakeStore({ settings = {}, appVersion = '0.0.0', settingsClient = null } = {}) {
  const settingsSlice = createSettingsSlice({ settings, settingsClient });
  const sessionSlice = createSessionSlice({ appVersion });
  const uiSlice = createUiSlice();
  const teamRevealSlice = createTeamRevealSlice();
  const buildSlice = createBuildSlice();
  const champSelectSlice = createChampSelectSlice();

  return createStore((set, get) => ({
    ...settingsSlice(set, get),
    ...sessionSlice(set, get),
    ...uiSlice(set, get),
    ...teamRevealSlice(set, get),
    ...buildSlice(set, get),
    ...champSelectSlice(set, get),

    syncLegacy({ settings: values, trayDown, screen, overlay, tourIndex, ...session }) {
      set((state) => ({
        settings: {
          ...state.settings,
          ...(values ? { values: { ...values } } : {}),
          ...(trayDown === undefined ? {} : { trayDown: !!trayDown }),
        },
        session: { ...state.session, ...defined(session) },
        ui: { ...state.ui, ...defined({ screen, overlay, tourIndex }) },
      }));
    },
  }));
}
