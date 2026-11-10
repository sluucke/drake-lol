import { useEffect } from 'react';
import { useDrakeStore } from '../store/StoreContext';

export function useEscapeLayer(active: boolean) {
  const store = useDrakeStore();
  useEffect(() => {
    if (!active) return undefined;
    store.getState().pushEscapeLayer();
    return () => store.getState().popEscapeLayer();
  }, [active, store]);
}
