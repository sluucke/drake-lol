import { useDrake } from '../store/StoreContext';
import type { StreamingInfo } from '../store/sessionSlice';

export function useStreaming(): StreamingInfo {
  return useDrake((state) => state.session.streaming) || { host: 'client', effective: 'in-client' };
}

export function useInClientChromeHidden(): boolean {
  return useDrake((state) => {
    const streaming = state.session.streaming;
    return streaming?.host !== 'overlay' && streaming?.effective === 'overlay';
  });
}
