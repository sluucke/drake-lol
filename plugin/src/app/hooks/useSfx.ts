import { createContext, useContext } from 'react';

export interface SfxPlayer {
  play(name: string): void;
}

export const NOOP_SFX: SfxPlayer = { play() {} };

export const SfxContext = createContext<SfxPlayer>(NOOP_SFX);

export function useSfx(): SfxPlayer {
  return useContext(SfxContext);
}
