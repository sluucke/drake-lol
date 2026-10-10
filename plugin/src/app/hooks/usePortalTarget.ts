import { createContext, useContext } from 'react';

export const PortalTargetContext = createContext<Element | DocumentFragment | null>(null);

export function usePortalTarget(): Element | DocumentFragment | null {
  return useContext(PortalTargetContext);
}
