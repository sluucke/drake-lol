import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import { createDrakeStore } from './createDrakeStore';
import type { DrakeState, DrakeStore } from './types';

const FALLBACK_STORE = createDrakeStore();

export const StoreContext = createContext<DrakeStore>(FALLBACK_STORE);

export function useDrakeStore(): DrakeStore {
  return useContext(StoreContext);
}

export function useDrake<T>(selector: (state: DrakeState) => T): T {
  return useStore(useContext(StoreContext), selector);
}
