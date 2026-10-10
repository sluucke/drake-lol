import type { DrakeSettings, SettingsPatch, SettingsValues } from '../../settings';
import type { SliceCreator } from './types';

const TRAY_DOWN_HINT = 'not running';

export interface SaveSettingsResult {
  ok: boolean;
  reason?: string;
}

export interface SettingsClient {
  save(patch: SettingsPatch): Promise<SaveSettingsResult>;
}

export interface SettingsState {
  values: SettingsValues;
  trayDown: boolean;
  error: string;
}

export interface SettingsSlice {
  settings: SettingsState;
  saveSettings(patch: SettingsPatch): Promise<SaveSettingsResult>;
}

export interface SettingsSliceOptions {
  settings: SettingsValues;
  settingsClient: SettingsClient | null;
}

function copyKey<K extends keyof DrakeSettings>(target: SettingsValues, source: SettingsValues, key: K) {
  target[key] = source[key];
}

function revertKeys(current: SettingsValues, previous: SettingsValues, patch: SettingsPatch): SettingsValues {
  const next: SettingsValues = { ...current };
  for (const key of Object.keys(patch) as (keyof DrakeSettings)[]) {
    if (Object.prototype.hasOwnProperty.call(previous, key)) copyKey(next, previous, key);
    else delete next[key];
  }
  return next;
}

export function createSettingsSlice({ settings, settingsClient }: SettingsSliceOptions): SliceCreator<SettingsSlice> {
  return (set, get) => ({
    settings: { values: { ...settings }, trayDown: false, error: '' },

    async saveSettings(patch) {
      const previous = get().settings.values;
      set((state) => ({
        settings: { ...state.settings, values: { ...state.settings.values, ...patch }, error: '' },
      }));
      if (!settingsClient) return { ok: true };
      const result = await settingsClient.save(patch);
      if (result.ok) {
        set((state) => ({ settings: { ...state.settings, trayDown: false } }));
        return result;
      }
      set((state) => ({
        settings: {
          values: revertKeys(state.settings.values, previous, patch),
          trayDown: String(result.reason || '').includes(TRAY_DOWN_HINT),
          error: result.reason || '',
        },
      }));
      return result;
    },
  });
}
