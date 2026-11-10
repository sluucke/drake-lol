import { createStore } from 'zustand/vanilla';
import type { SettingsValues } from '../../settings';
import { createSettingsSlice } from './settingsSlice';
import type { SettingsClient } from './settingsSlice';
import { createSessionSlice } from './sessionSlice';
import { createUiSlice } from './uiSlice';
import { createTeamRevealSlice } from './teamRevealSlice';
import { createBuildSlice } from './buildSlice';
import { createChampSelectSlice } from './champSelectSlice';
import type { DrakeState, DrakeStore } from './types';

export type { DrakeState, DrakeStore } from './types';

export interface CreateDrakeStoreOptions {
  settings?: SettingsValues;
  appVersion?: string;
  settingsClient?: SettingsClient | null;
}

function defined<T extends object>(fields: T): Partial<T> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export function createDrakeStore({ settings = {}, appVersion = '0.0.0', settingsClient = null }: CreateDrakeStoreOptions = {}): DrakeStore {
  const settingsSlice = createSettingsSlice({ settings, settingsClient });
  const sessionSlice = createSessionSlice({ appVersion });
  const uiSlice = createUiSlice();
  const teamRevealSlice = createTeamRevealSlice();
  const buildSlice = createBuildSlice();
  const champSelectSlice = createChampSelectSlice();

  return createStore<DrakeState>((set, get) => ({
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
