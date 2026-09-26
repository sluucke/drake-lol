import { createContext, useContext } from 'react';

export const PortalTargetContext = createContext(null);

export function usePortalTarget() {
  return useContext(PortalTargetContext);
}
