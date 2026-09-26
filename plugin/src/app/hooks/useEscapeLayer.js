import { useEffect } from 'react';
import { useDrakeStore } from '../store/StoreContext.jsx';

export function useEscapeLayer(active) {
  const store = useDrakeStore();
  useEffect(() => {
    if (!active) return undefined;
    store.getState().pushEscapeLayer();
    return () => store.getState().popEscapeLayer();
  }, [active, store]);
}
