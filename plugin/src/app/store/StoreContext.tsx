// @ts-nocheck
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import { createDrakeStore } from './createDrakeStore';

const FALLBACK_STORE = createDrakeStore();

export const StoreContext = createContext(FALLBACK_STORE);

export function useDrakeStore() {
  return useContext(StoreContext);
}

export function useDrake(selector) {
  return useStore(useContext(StoreContext), selector);
}
