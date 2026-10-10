import type { FetchLike } from './lcu';

const DEFAULT_POLL_INTERVAL_MS = 1000;

export type SubscriptionHandler<T> = (payload: T | null) => void;

export interface SubscribeOptions {
  fetchImpl?: FetchLike;
  intervalMs?: number;
}

export type Unsubscribe = () => void;

export type SubscribeFn = <T = unknown>(
  route: string,
  handler: SubscriptionHandler<T>,
  options?: SubscribeOptions,
) => Unsubscribe;

export function socketPushAvailable(): boolean {
  return typeof socket !== 'undefined' && !!socket && typeof socket.observe === 'function';
}

export function subscribe<T = unknown>(
  route: string,
  handler: SubscriptionHandler<T>,
  { fetchImpl = fetch, intervalMs = DEFAULT_POLL_INTERVAL_MS }: SubscribeOptions = {},
): Unsubscribe {
  const push = socketPushAvailable();

  let stopped = false;
  let idle = false;
  let seen = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const res = await fetchImpl(route);
      if (!res.ok) {
        
        
        
        if (!idle) {
          idle = true;
          if (!stopped) handler(null);
        }
        return;
      }
      const payload = (await res.json()) as T;
      if (stopped) return;
      const reentered = idle;
      idle = false;
      if (push && seen && !reentered) return;
      seen = true;
      handler(payload);
    } catch {
      
      
    }
  };

  void tick();
  const id = setInterval(tick, intervalMs);

  let unobserve = () => {};
  if (push && socket) {
    const live = socket;
    const observer: PenguSocketHandler = (message) => {
      if (stopped) return;
      if (!message || message.eventType === 'Delete' || message.data == null) {
        idle = true;
        handler(null);
        return;
      }
      idle = false;
      seen = true;
      handler(message.data as T);
    };
    const subscription = live.observe(route, observer);
    unobserve = () => {
      if (subscription && typeof subscription.disconnect === 'function') {
        subscription.disconnect();
        return;
      }
      if (typeof socket !== 'undefined' && socket && typeof socket.disconnect === 'function') {
        socket.disconnect(route, observer);
      }
    };
  }

  return () => {
    stopped = true;
    clearInterval(id);
    unobserve();
  };
}
