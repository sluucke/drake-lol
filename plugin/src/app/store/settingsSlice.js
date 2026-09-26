const TRAY_DOWN_HINT = 'not running';

function revertKeys(current, previous, patch) {
  const next = { ...current };
  for (const key of Object.keys(patch)) {
    if (Object.prototype.hasOwnProperty.call(previous, key)) next[key] = previous[key];
    else delete next[key];
  }
  return next;
}

export function createSettingsSlice({ settings, settingsClient }) {
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
