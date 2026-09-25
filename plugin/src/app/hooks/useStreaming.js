import { useDrake } from '../store/StoreContext.jsx';

export function useStreaming() {
  return useDrake((state) => state.session.streaming) || { host: 'client', effective: 'in-client' };
}

export function useInClientChromeHidden() {
  return useDrake((state) => {
    const streaming = state.session.streaming;
    return streaming?.host !== 'overlay' && streaming?.effective === 'overlay';
  });
}
