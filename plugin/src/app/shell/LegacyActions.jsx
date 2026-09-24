import { createContext, useContext } from 'react';

const resolved = async () => ({ ok: true });

export const NOOP_ACTIONS = {
  navigate() {},
  close() {},
  openUrl() {},
  setSettings: resolved,
  saveStatus: resolved,
  revealLobby: async () => ({ ok: true, count: 0 }),
  dodge: resolved,
  checkUpdates: async () => {},
  installUpdate: resolved,
  restartClient: resolved,
  selectProfileTab: async () => {},
  applyProfileRank: resolved,
  resetProfileRank: resolved,
  removeBadges: resolved,
  cloneBadge: resolved,
  saveRiotId: resolved,
  setBackground: resolved,
  removeAllFriends: async () => ({ removed: 0, failed: 0 }),
};

export const LegacyActionsContext = createContext(NOOP_ACTIONS);

export function useLegacyActions() {
  return useContext(LegacyActionsContext);
}
