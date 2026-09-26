import { createContext, useContext } from 'react';

export const NOOP_SFX = { play() {} };

export const SfxContext = createContext(NOOP_SFX);

export function useSfx() {
  return useContext(SfxContext);
}
