import { createContext, useContext } from 'react';

export const NOOP_ACTIONS = {
  navigate() {},
  close() {},
  openUrl() {},
};

export const LegacyActionsContext = createContext(NOOP_ACTIONS);

export function useLegacyActions() {
  return useContext(LegacyActionsContext);
}
